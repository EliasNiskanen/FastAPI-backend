#!/usr/bin/env bash
# One-command deploy of the backend to Google Cloud Run, with a Neon database.
#
# Run this in Google Cloud Shell (https://shell.cloud.google.com), from the
# repository root:
#
#   git clone https://github.com/EliasNiskanen/BullBearScope.git
#   cd BullBearScope
#   bash deploy/gcp/setup.sh
#
# It is safe to run again: existing resources are reused and secrets get a
# new version. Re-running is also how you redeploy after code changes.
#
# What it does:
#   1. Enables the needed Google Cloud APIs
#   2. Stores the database URL, Alpha Vantage key and an ingest token in Secret Manager
#   3. Creates a service account the running app uses (can only read those secrets)
#   4. Builds the Dockerfile with Cloud Build and deploys it to Cloud Run
#   5. Checks /health/ready and prints the app URL
set -euo pipefail

REGION="${REGION:-europe-north1}" # Finland
SERVICE="${SERVICE:-market-backend}"
RUN_SA_NAME="market-backend-run"

# Print a step header so it's easy to see where the script is.
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# Store a value in Secret Manager: create the secret on first run, add a new version later.
put_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --project "$PROJECT_ID" --data-file=- >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" --project "$PROJECT_ID" \
      --replication-policy=automatic --data-file=- >/dev/null
  fi
  echo "   saved secret: $name"
}

# Give a member a project role. A service account created seconds ago may not
# be visible yet ("does not exist"), so retry for up to ~2 minutes.
grant_role() {
  local member="$1" role="$2" i
  for i in $(seq 1 12); do
    if gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="$member" \
      --role="$role" --condition=None >/dev/null 2>&1; then
      echo "   granted $role"
      return 0
    fi
    echo "   waiting for $member to become visible ($i/12)..."
    sleep 10
  done
  # Last try without hiding the error, so the real reason is shown.
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="$member" \
    --role="$role" --condition=None >/dev/null
}

# Return 0 if the secret already exists (used to keep values on re-runs).
secret_exists() { gcloud secrets describe "$1" --project "$PROJECT_ID" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
step "Project"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT_ID" ]; then
  gcloud projects list --format='table(projectId,name)'
  read -rp "Project ID to deploy to: " PROJECT_ID
fi
gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
echo "   project: $PROJECT_ID ($PROJECT_NUMBER), region: $REGION"

# ---------------------------------------------------------------------------
step "Enabling APIs (first time takes a minute)"
# compute.googleapis.com creates the default service account Cloud Build runs as;
# enabling it costs nothing.
gcloud services enable run.googleapis.com cloudbuild.googleapis.com compute.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

# ---------------------------------------------------------------------------
step "Secrets"
if secret_exists database-url && [ -z "${RESET_SECRETS:-}${RESET_DATABASE_URL:-}" ]; then
  echo "   database-url exists, keeping it (set RESET_DATABASE_URL=1 to change)"
else
  echo "   Paste the Neon connection string (Neon console -> Connect) ONCE, then press Enter."
  echo "   It looks like postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
  echo "   (Nothing is shown while you paste; that's normal.)"
  while true; do
    read -rsp "   DATABASE_URL: " DB_URL; echo
    DB_URL="$(printf '%s' "$DB_URL" | tr -d '[:space:]')" # drop stray spaces/newlines
    # Exactly one "://" means it was pasted once; two means it was pasted twice.
    schemes=$(grep -o '://' <<<"$DB_URL" | wc -l)
    if [[ "$DB_URL" =~ ^postgres(ql)?:// ]] && [ "$schemes" -eq 1 ] && [[ "$DB_URL" == *@* ]]; then
      break
    fi
    echo "   That doesn't look like a single postgresql://... connection string"
    echo "   (pasted twice, or something missing). Please paste it again."
  done
  # SQLAlchemy needs the driver name in the scheme.
  DB_URL="${DB_URL/#postgresql:\/\//postgresql+psycopg://}"
  DB_URL="${DB_URL/#postgres:\/\//postgresql+psycopg://}"
  # Use Neon's direct endpoint, not the "-pooler" one: the app keeps its own
  # connection pool, and migrations need a direct connection.
  DB_URL="${DB_URL/-pooler./.}"
  put_secret database-url "$DB_URL"
fi

if secret_exists alphavantage-api-key && [ -z "${RESET_SECRETS:-}${RESET_ALPHAVANTAGE_KEY:-}" ]; then
  echo "   alphavantage-api-key exists, keeping it (set RESET_ALPHAVANTAGE_KEY=1 to change)"
else
  read -rsp "   ALPHAVANTAGE_API_KEY: " AV_KEY; echo
  put_secret alphavantage-api-key "$AV_KEY"
fi

if secret_exists ingest-token; then
  echo "   ingest-token exists, keeping it"
else
  put_secret ingest-token "$(openssl rand -hex 32)"
fi

# ---------------------------------------------------------------------------
step "Service accounts"
RUN_SA="$RUN_SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$RUN_SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUN_SA_NAME" --display-name="Market backend (Cloud Run)"
fi
# The app may read secrets, nothing else.
grant_role "serviceAccount:$RUN_SA" roles/secretmanager.secretAccessor
# Cloud Build runs as the Compute Engine default service account and needs
# this role to build and push the image (new projects don't grant it automatically).
grant_role "serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" roles/run.builder
echo "   ok (a new role can take a couple of minutes to take effect;"
echo "   if the build fails with a permission error, wait and run the script again)"

# ---------------------------------------------------------------------------
step "Building and deploying to Cloud Run (takes a few minutes)"
# Environment variables are only changed when given, so a redeploy keeps the
# CORS origin that deploy/gcp/frontend.sh set for the frontend.
env_args=()
if [ -n "${CORS_ORIGINS:-}" ]; then
  env_args+=(--update-env-vars "^|^CORS_ORIGINS=${CORS_ORIGINS}")
fi
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$RUN_SA" \
  --allow-unauthenticated \
  --set-secrets "DATABASE_URL=database-url:latest,ALPHAVANTAGE_API_KEY=alphavantage-api-key:latest,INGEST_TOKEN=ingest-token:latest" \
  "${env_args[@]}" \
  --min-instances 0 \
  --max-instances 2 \
  --quiet

# ---------------------------------------------------------------------------
step "Checking the deployment"
URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')
# The first request wakes up both Cloud Run and Neon, so allow a few retries.
if curl -fsS --retry 6 --retry-delay 5 --retry-all-errors "$URL/health/ready"; then
  echo
  echo "   database connection OK"
else
  echo
  echo "   /health/ready failed. Check the logs:"
  echo "   gcloud run services logs read $SERVICE --region $REGION --limit 50"
  exit 1
fi

cat <<EOF

Done! Your backend is live:

  $URL/docs                       interactive API docs
  $URL/api/stocks/IBM?interval=daily
  $URL/api/crypto/BTC?quote=EUR

For the scheduled data pulls (GitHub -> Settings -> Secrets and variables -> Actions):
  Variable API_URL       = $URL
  Variable INGEST_SYMBOLS = e.g. IBM AAPL MSFT
  Variable INGEST_CRYPTO  = e.g. BTC/EUR ETH/EUR
  Secret   INGEST_TOKEN  = (print it with:
           gcloud secrets versions access latest --secret ingest-token)

Set a budget alert too: https://console.cloud.google.com/billing/budgets
EOF
