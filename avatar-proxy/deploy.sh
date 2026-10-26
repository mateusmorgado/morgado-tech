#!/usr/bin/env bash
# Update the EXISTING Cloud Run service only. Does not modify knowledge or secrets.
set -euo pipefail
cd "$(dirname "$0")"
: "${PROJECT_ID:?Set PROJECT_ID to the Google Cloud project containing mateus-avatar}"
: "${REGION:?Set REGION to the current Cloud Run service region}"
gcloud run services describe mateus-avatar \
  --project "$PROJECT_ID" --region "$REGION" >/dev/null
gcloud run deploy mateus-avatar --source . \
  --project "$PROJECT_ID" --region "$REGION"
