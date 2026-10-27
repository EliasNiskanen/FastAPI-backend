#!/usr/bin/env bash
# One-time setup: let GitHub Actions deploy the backend to Cloud Run without
# any stored keys (Workload Identity Federation, keyless OIDC login).
#
# Run once in Google Cloud Shell, from the repository root:
#
#   bash deploy/gcp/github-deploy-setup.sh
#
# Afterwards .github/workflows/deploy-backend.yml deploys automatically
# every time CI passes on the main branch. Safe to re-run.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-marketvisualization-backend}"
# GitHub's numeric repository id: stays valid even if the repo is renamed.
REPO_ID="${REPO_ID:-963927145}"
POOL="github"
PROVIDER="github-repo"
DEPLOYER_NAME="github-deployer"
RUN_SA="market-backend-run@${PROJECT_ID}.iam.gserviceaccount.com"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

step "APIs"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com

step "Deployer service account"
DEPLOYER="${DEPLOYER_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$DEPLOYER" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$DEPLOYER_NAME" --display-name="GitHub Actions deployer"
  sleep 10 # new accounts take a moment to become usable
fi
# Exactly what `gcloud run deploy --source` needs, nothing more.
for role in roles/run.sourceDeveloper roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOYER" \
    --role="$role" --condition=None >/dev/null
  echo "   granted $role"
done
# The deployer may start the service as its runtime identity.
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser >/dev/null
echo "   may act as $RUN_SA"

step "Workload identity pool for GitHub"
if ! gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
fi
# Only workflows from this repository, running on the main branch, can log in.
CONDITION="assertion.repository_id=='${REPO_ID}' && assertion.ref=='refs/heads/main'"
if gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" \
    --location=global --workload-identity-pool="$POOL" --attribute-condition="$CONDITION" >/dev/null
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location=global --workload-identity-pool="$POOL" \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping=google.subject=assertion.sub,attribute.repository_id=assertion.repository_id \
    --attribute-condition="$CONDITION"
fi
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository_id/${REPO_ID}" \
  >/dev/null
echo "   GitHub repository ${REPO_ID} (main branch) may deploy as $DEPLOYER"

cat <<DONE

Done. Values used by .github/workflows/deploy-backend.yml:

  workload_identity_provider: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}
  service_account:            ${DEPLOYER}

The next merge to main deploys the backend automatically
(GitHub -> Actions -> "Deploy backend").
DONE
