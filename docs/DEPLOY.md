# Deploying

The backend ships as one Docker image that reads all configuration from
environment variables. The same image runs locally (docker compose), on
**Google Cloud Run** and on **AWS ECS Express Mode**. Only the managed
PostgreSQL and the place secrets live differ.

```mermaid
flowchart LR
    FE[Frontend] -->|GET /api/stocks/SYMBOL| API[FastAPI container]
    SCH[GitHub Actions cron] -->|POST /api/ingest/SYMBOL| API
    API -->|read / upsert| DB[(PostgreSQL)]
    API -->|stocks, only when stale| AV[Alpha Vantage]
    API -->|crypto, only when stale| BN[Binance public API]
```

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql+psycopg://user:pass@host:5432/db`. URL-encode special characters in the password. |
| `ALPHAVANTAGE_API_KEY` | yes | Keep it in a secret store, never in code. |
| `CACHE_TTL_MINUTES` | no | Default 60. How old stored stock data may be before Alpha Vantage is called again. |
| `CRYPTO_CACHE_TTL_MINUTES` | no | Default 5. Same for crypto (Binance has no daily quota). |
| `DEFAULT_CRYPTO_QUOTE` | no | Default `USDT`. Quote currency when a request has no `?quote=`. |
| `CORS_ORIGINS` | no | Comma-separated frontend origins. |
| `INGEST_TOKEN` | recommended | Protects `POST /api/ingest/*`. Generate with `openssl rand -hex 32`. |
| `RUN_MIGRATIONS` | no | Default `true`: the container runs `alembic upgrade head` before starting. |
| `PORT` | no | Set automatically by Cloud Run. Default 8000. |

Health checks: `GET /health` (process up) and `GET /health/ready` (database reachable).

**Region matters for crypto:** Binance blocks requests from some countries,
including the US. Run the backend in an EU region (`europe-north1` on GCP,
`eu-north-1` on AWS). The GitHub Actions ingest only calls *your* API, so it
is not affected.

---

## Option A: Google Cloud (Cloud Run + Cloud SQL)

Good fit for a personal project: Cloud Run scales to zero when nobody is
using the app. `europe-north1` is the Finland region.

### 1. Project and services

```bash
PROJECT_ID=your-project-id
REGION=europe-north1
REPO=EliasNiskanen/FastAPI-backend

gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com

gcloud artifacts repositories create market-backend \
  --repository-format=docker --location=$REGION
```

### 2. Database

```bash
gcloud sql instances create market-db --database-version=POSTGRES_16 \
  --edition=ENTERPRISE --tier=db-f1-micro --region=$REGION
gcloud sql databases create stocks --instance=market-db
gcloud sql users create app --instance=market-db --password='CHOOSE_A_PASSWORD'
```

### 3. Secrets

Cloud Run connects to Cloud SQL through a unix socket, hence the `host=/cloudsql/...` URL.

```bash
printf 'postgresql+psycopg://app:CHOOSE_A_PASSWORD@/stocks?host=/cloudsql/%s:%s:market-db' \
  $PROJECT_ID $REGION | gcloud secrets create database-url --data-file=-
printf '%s' 'YOUR_ALPHAVANTAGE_KEY' | gcloud secrets create alphavantage-api-key --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create ingest-token --data-file=-
```

### 4. Service accounts

```bash
# Identity the running container uses
gcloud iam service-accounts create market-backend-run
RUN_SA=market-backend-run@$PROJECT_ID.iam.gserviceaccount.com
for role in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$RUN_SA --role=$role
done

# Identity GitHub Actions uses to deploy
gcloud iam service-accounts create github-deployer
DEPLOY_SA=github-deployer@$PROJECT_ID.iam.gserviceaccount.com
for role in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$DEPLOY_SA --role=$role
done
gcloud iam service-accounts add-iam-policy-binding $RUN_SA \
  --member=serviceAccount:$DEPLOY_SA --role=roles/iam.serviceAccountUser
```

### 5. Keyless login from GitHub (Workload Identity Federation)

No JSON key files: GitHub proves who it is with OIDC, and only this repository is allowed.

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github-repo \
  --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition="assertion.repository=='$REPO'"

gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

### 6. GitHub repository variables

Settings → Secrets and variables → Actions → **Variables**:

| Name | Value |
|---|---|
| `GCP_PROJECT_ID` | your project id |
| `GCP_REGION` | `europe-north1` |
| `GCP_SERVICE_ACCOUNT` | `github-deployer@PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SA` | `market-backend-run@PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-repo` |
| `CLOUDSQL_INSTANCE` | `PROJECT_ID:europe-north1:market-db` |
| `CORS_ORIGINS` | your frontend URL(s) |

Then Actions → **Deploy to GCP (Cloud Run)** → Run workflow. The last step
calls `/health/ready` on the new URL.

---

## Option B: AWS (ECR + ECS Express Mode + RDS)

App Runner no longer accepts new customers (since 30 April 2026); AWS points
to **ECS Express Mode** instead. It creates a load balancer, an HTTPS URL
(`<service>.ecs.<region>.on.aws`), autoscaling and logging from one command.
Note that unlike Cloud Run it keeps at least one task and the load balancer
running, so it has a fixed monthly cost.

```bash
REGION=eu-north-1   # Stockholm; check that ECS Express Mode is offered in your region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

### 1. Image registry and logs

```bash
aws ecr create-repository --repository-name market-backend --region $REGION
aws logs create-log-group --log-group-name /ecs/market-backend --region $REGION
```

### 2. Database (RDS PostgreSQL)

```bash
aws rds create-db-instance --region $REGION \
  --db-instance-identifier market-db --engine postgres \
  --db-instance-class db.t4g.micro --allocated-storage 20 \
  --master-username app --master-user-password 'CHOOSE_A_PASSWORD' \
  --db-name stocks --no-publicly-accessible --backup-retention-period 1
aws rds wait db-instance-available --db-instance-identifier market-db --region $REGION
aws rds describe-db-instances --db-instance-identifier market-db --region $REGION \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

### 3. Secrets (SSM Parameter Store)

```bash
aws ssm put-parameter --region $REGION --type SecureString --name /market-backend/database-url \
  --value 'postgresql+psycopg://app:CHOOSE_A_PASSWORD@RDS_ENDPOINT:5432/stocks?sslmode=require'
aws ssm put-parameter --region $REGION --type SecureString --name /market-backend/alphavantage-api-key \
  --value 'YOUR_ALPHAVANTAGE_KEY'
aws ssm put-parameter --region $REGION --type SecureString --name /market-backend/ingest-token \
  --value "$(openssl rand -hex 32)"
```

### 4. IAM roles for ECS

```bash
aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
# Let the container read the SSM parameters above
aws iam put-role-policy --role-name ecsTaskExecutionRole --policy-name market-backend-ssm \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"ssm:GetParameters\",\"Resource\":\"arn:aws:ssm:$REGION:$ACCOUNT_ID:parameter/market-backend/*\"}]}"

aws iam create-role --role-name ecsInfrastructureRoleForExpressServices --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name ecsInfrastructureRoleForExpressServices \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices
```

### 5. First image and service

Push the first image by hand (later the workflow does it):

```bash
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
IMAGE=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/market-backend:initial
docker build -t $IMAGE . && docker push $IMAGE

sed -e "s#__IMAGE__#$IMAGE#" -e "s#__CORS_ORIGINS__#https://your-frontend#" \
  deploy/aws/primary-container.json > /tmp/container.json

aws ecs create-express-gateway-service --region $REGION \
  --service-name market-backend \
  --primary-container file:///tmp/container.json \
  --execution-role-arn arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole \
  --infrastructure-role-arn arn:aws:iam::$ACCOUNT_ID:role/ecsInfrastructureRoleForExpressServices \
  --health-check-path /health \
  --scaling-target '{"minTaskCount":1,"maxTaskCount":2}' \
  --monitor-resources
```

**Database networking:** the RDS instance is private. In the RDS security
group, allow inbound TCP 5432 from the security group the ECS service's tasks
use (ECS console → the service → Networking). Until then `/health/ready`
returns 503.

### 6. Keyless login from GitHub (OIDC role)

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com

aws iam create-role --role-name github-deploy-market-backend --assume-role-policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{\"Effect\":\"Allow\",
    \"Principal\":{\"Federated\":\"arn:aws:iam::$ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com\"},
    \"Action\":\"sts:AssumeRoleWithWebIdentity\",
    \"Condition\":{
      \"StringEquals\":{\"token.actions.githubusercontent.com:aud\":\"sts.amazonaws.com\"},
      \"StringLike\":{\"token.actions.githubusercontent.com:sub\":\"repo:EliasNiskanen/FastAPI-backend:*\"}}}]}"

aws iam attach-role-policy --role-name github-deploy-market-backend \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
aws iam put-role-policy --role-name github-deploy-market-backend --policy-name ecs-deploy \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":[\"ecs:UpdateExpressGatewayService\",\"ecs:DescribeExpressGatewayService\"],\"Resource\":\"*\"},
    {\"Effect\":\"Allow\",\"Action\":\"iam:PassRole\",\"Resource\":\"arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole\"}]}"
```

If a deploy fails with an AccessDenied for another `ecs:` action, add that
action to the `ecs-deploy` policy.

### 7. GitHub repository variables

| Name | Value |
|---|---|
| `AWS_REGION` | `eu-north-1` |
| `AWS_ROLE_ARN` | `arn:aws:iam::ACCOUNT_ID:role/github-deploy-market-backend` |
| `ECR_REPOSITORY` | `market-backend` |
| `ECS_SERVICE_ARN` | ARN printed by `create-express-gateway-service` |
| `CORS_ORIGINS` | your frontend URL(s) |

Then Actions → **Deploy to AWS (ECS Express Mode)** → Run workflow.

---

## Scheduled data pulls (both clouds)

`.github/workflows/ingest.yml` pulls stocks on weekdays after US market close
(`5min` and `daily`) and crypto twice a day, every day (`5min`, `60min`,
`daily`). Set:

- Variable `API_URL`: the service URL (Cloud Run URL or `*.ecs.*.on.aws`)
- Variable `INGEST_SYMBOLS`: stocks, e.g. `IBM AAPL MSFT`
- Variable `INGEST_CRYPTO`: crypto pairs, e.g. `BTC/EUR ETH/EUR SOL/USDT`
- Secret `INGEST_TOKEN`: same value as in the cloud secret store

With the free Alpha Vantage quota, keep `stock symbols × 2` well under the
daily limit. Crypto does not use that quota.

## Migrations

By default every container start runs `alembic upgrade head`. That is fine
with one or two instances. If you scale out, set `RUN_MIGRATIONS=false` and
run migrations once per deploy as a separate job (Cloud Run Job / ECS task).

Create a new migration after changing `app/models.py`:

```bash
poetry run alembic revision --autogenerate -m "describe the change"
```

## Keeping costs down

- Cloud Run with `--min-instances 0` costs nothing while idle; the managed
  database is the main fixed cost on either cloud.
- The app only needs a `DATABASE_URL`, so any hosted PostgreSQL works,
  including providers with a free tier.
- Set a budget alert in the billing console of whichever cloud you use.
