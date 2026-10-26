# Live avatar proxy

This service runs on Google Cloud Run, not Vercel. It keeps Google authentication
server-side, forwards the live conversation, and reads the private knowledge bucket.
`/knowledge` is protected by `KNOWLEDGE_SECRET`; `/live` checks allowed origins.

No biography files, service-account JSON keys or secrets belong in this folder.
The service uses its assigned Cloud Run identity to access Vertex AI and Storage.

## Update the existing service

First find the existing service's project ID and region in the Cloud Run console.
Then, with gcloud installed and signed in:

```sh
export PROJECT_ID="your-existing-project-id"
export REGION="your-existing-service-region"
bash avatar-proxy/deploy.sh
```

The deployment script checks that the service already exists and deploys only its code.
It does not upload starter knowledge, rotate secrets or reset environment variables.
Review any proposed Cloud Run configuration changes before approving them.

Do not use the earlier bootstrap script for routine updates: it uploaded starter files.

## Configuration already stored on Cloud Run

`GOOGLE_CLOUD_PROJECT`, `LIVE_LOCATION`, `KNOWLEDGE_BUCKET`,
`KNOWLEDGE_SECRET`, `ALLOWED_ORIGINS`, and optionally avatar/voice and limit settings.

## Limits and security

The five-minute timer is enforced per connection. Concurrent and daily counters are
in memory, per instance, and reset on restarts. They are not a global spending cap.
Origin checking alone is not authentication and non-browser clients can spoof it.
Use shared counters and verified session tokens before relying on hard global limits.

Cloud Run and Google model usage incur charges independently of Vercel.
Use appropriate quotas and budget alerts; alerts alone do not stop spending.
