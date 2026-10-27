#!/usr/bin/env bash
# Deploy the React frontend to Google Cloud Run, next to the backend.
#
# Run in Google Cloud Shell from the repository root, after deploy/gcp/setup.sh:
#
#   bash deploy/gcp/frontend.sh
#
# What it does:
#   1. Looks up the backend's URL
#   2. Builds frontend/Dockerfile with Cloud Build and deploys it to Cloud Run,
#      telling the frontend where the backend is (API_URL)
#   3. Allows the frontend's address in the backend's CORS settings
#   4. Checks that both answer and prints the address to open
#
# Safe to re-run; re-running is also how you deploy frontend changes.
set -euo pipefail

REGION="${REGION:-europe-north1}"
BACKEND="${BACKEND:-market-backend}"
FRONTEND="${FRONTEND:-market-frontend}"
FRONT_SA_NAME="market-frontend-run"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT_ID" ]; then
  echo "No project selected. Run: gcloud config set project YOUR_PROJECT_ID" >&2
  exit 1
fi

step "Backend"
API_URL=$(gcloud run services describe "$BACKEND" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)
if [ -z "$API_URL" ]; then
  echo "   Backend service '$BACKEND' not found in $REGION. Run deploy/gcp/setup.sh first." >&2
  exit 1
fi
echo "   $API_URL"

step "Service account"
# The frontend only serves static files, so it runs as an account with no permissions.
FRONT_SA="$FRONT_SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$FRONT_SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$FRONT_SA_NAME" --display-name="Market frontend (Cloud Run)"
  sleep 10 # new service accounts take a moment to become usable
fi
echo "   $FRONT_SA"

step "Building and deploying the frontend (takes a few minutes)"
gcloud run deploy "$FRONTEND" \
  --source frontend \
  --region "$REGION" \
  --service-account "$FRONT_SA" \
  --allow-unauthenticated \
  --set-env-vars "API_URL=$API_URL" \
  --memory 256Mi \
  --min-instances 0 \
  --max-instances 2 \
  --quiet

FRONT_URL=$(gcloud run services describe "$FRONTEND" --region "$REGION" --format 'value(status.url)')

step "Allowing the frontend in the backend's CORS settings"
gcloud run services update "$BACKEND" --region "$REGION" \
  --update-env-vars "^|^CORS_ORIGINS=$FRONT_URL" --quiet >/dev/null
echo "   CORS_ORIGINS=$FRONT_URL"

step "Checking"
curl -fsS --retry 5 --retry-delay 3 --retry-all-errors "$FRONT_URL/config.js"
if curl -fsS -o /dev/null --retry 6 --retry-delay 5 --retry-all-errors \
  -H "Origin: $FRONT_URL" "$API_URL/api/market/movers?asset_class=crypto"; then
  echo "   backend answers the frontend"
else
  echo "   The backend did not answer. Logs: gcloud run services logs read $BACKEND --region $REGION --limit 50"
  exit 1
fi

cat <<DONE

Done! Open your app:

  $FRONT_URL

To deploy changes later, run this script again (frontend) or
deploy/gcp/setup.sh (backend).
DONE
