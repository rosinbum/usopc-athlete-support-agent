# Production Deployment

## Prerequisites

- Two GCP projects created: `usopc-athlete-support-staging` and `usopc-athlete-support-prod`
- `gcloud` CLI installed and authenticated
- Pulumi CLI installed (`brew install pulumi/tap/pulumi` or `npm install -g pulumi`)
- A Pulumi Cloud account (for state management)
- GitHub repo with Actions enabled

## 1. GCP Project Setup

### Enable Required APIs

Run for each project:

```bash
PROJECT="usopc-athlete-support-staging"  # repeat with -prod

for API in \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  pubsub.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  monitoring.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com; do
  gcloud services enable "$API" --project="$PROJECT"
done
```

> Pulumi also enables these APIs declaratively, but enabling them beforehand avoids chicken-and-egg issues on the first deploy.

## 2. Workload Identity Federation (WIF)

WIF lets GitHub Actions authenticate to GCP without long-lived service account keys. Set this up **once per GCP project**.

### 2a. Create the Workload Identity Pool

```bash
PROJECT="usopc-athlete-support-staging"

gcloud iam workload-identity-pools create "github-pool" \
  --project="$PROJECT" \
  --location="global" \
  --display-name="GitHub Actions"
```

### 2b. Create the OIDC Provider

```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="$PROJECT" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == 'rosinbum/usopc-athlete-support-agent'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

> Change `rosinbum/usopc-athlete-support-agent` to your actual `owner/repo`.

### 2c. Create the Deploy Service Account

```bash
gcloud iam service-accounts create deploy \
  --project="$PROJECT" \
  --display-name="GitHub Actions Deploy"
```

### 2d. Grant Deployment Roles

```bash
SA="deploy@${PROJECT}.iam.gserviceaccount.com"

for ROLE in \
  roles/artifactregistry.writer \
  roles/run.admin \
  roles/cloudsql.admin \
  roles/pubsub.admin \
  roles/storage.admin \
  roles/secretmanager.admin \
  roles/iam.serviceAccountUser \
  roles/serviceusage.serviceUsageAdmin \
  roles/monitoring.admin \
  roles/cloudscheduler.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SA}" \
    --role="$ROLE"
done
```

### 2e. Bind WIF to the Service Account

This allows GitHub Actions (and only your repo) to impersonate the deploy service account:

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)")

gcloud iam service-accounts add-iam-policy-binding \
  "deploy@${PROJECT}.iam.gserviceaccount.com" \
  --project="$PROJECT" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/rosinbum/usopc-athlete-support-agent"
```

### 2f. Get the Provider Resource Name

```bash
gcloud iam workload-identity-pools providers describe "github-provider" \
  --project="$PROJECT" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --format="value(name)"
```

Save this output — it goes into the `GCP_WORKLOAD_IDENTITY_PROVIDER` GitHub secret.

**Repeat steps 2a-2f for the production project** (`usopc-athlete-support-prod`).

## 3. Pulumi Setup

### Initialize Stacks

```bash
cd infra/gcp
npm install

pulumi login  # authenticates with Pulumi Cloud

pulumi stack init staging
pulumi stack init production
```

### Set the DB Password

```bash
pulumi config set --secret usopc:dbPassword <staging-password> --stack staging
pulumi config set --secret usopc:dbPassword <production-password> --stack production
```

### (Optional) Set Alert Email

```bash
pulumi config set usopc:alertEmail your-email@example.com --stack staging
```

### Preview Infrastructure

```bash
pulumi preview --stack staging
```

## 4. GitHub Configuration

### Environments

Create two environments in **Settings > Environments**:

| Environment  | Protection Rules                     |
| ------------ | ------------------------------------ |
| `staging`    | None (auto-deploy on push to `main`) |
| `production` | Required reviewers                   |

### Secrets

Add these repository secrets (or environment-scoped secrets if using different values per environment):

| Secret                           | Value                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Provider resource name from step 2f                                                            |
| `GCP_SERVICE_ACCOUNT`            | `deploy@<project-id>.iam.gserviceaccount.com`                                                  |
| `PULUMI_ACCESS_TOKEN`            | Pulumi personal access token                                                                   |
| `DB_CONNECTION_NAME`             | `<project-id>:<region>:<instance-name>` (available after first Pulumi deploy)                  |
| `DATABASE_URL`                   | `postgresql://app:<password>@localhost:5432/usopc_athlete_support` (used with Cloud SQL Proxy) |

## 5. First Deployment

### Option A: Automatic (via CI)

Push to `main` to trigger a staging deploy:

```bash
git push origin main
```

Tag a release to trigger a production deploy:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Option B: Manual Trigger

Go to **Actions > Deploy to GCP > Run workflow** and select the environment.

### What the Workflow Does

1. **build-images** — Builds and pushes Docker images (web, slack, worker) to Artifact Registry
2. **migrate** — Runs database migrations via Cloud SQL Auth Proxy
3. **deploy** — Runs `pulumi up` to create/update all GCP resources
4. **smoke-test** — Curls `/api/health` (web) and `/health` (worker)

## 6. Populate Secret Manager

After the first Pulumi deploy creates the Secret Manager secrets, populate them with actual values:

```bash
PROJECT="usopc-athlete-support-staging"
PREFIX="usopc-staging"

# Required
echo -n "postgresql://app:<password>@/usopc_athlete_support?host=/cloudsql/<connection-name>" | \
  gcloud secrets versions add "${PREFIX}-DATABASE_URL" --data-file=- --project="$PROJECT"

echo -n "<key>" | gcloud secrets versions add "${PREFIX}-OPENAI_API_KEY" --data-file=- --project="$PROJECT"
echo -n "<key>" | gcloud secrets versions add "${PREFIX}-ANTHROPIC_API_KEY" --data-file=- --project="$PROJECT"
echo -n "<secret>" | gcloud secrets versions add "${PREFIX}-AUTH_SECRET" --data-file=- --project="$PROJECT"
echo -n "<id>" | gcloud secrets versions add "${PREFIX}-GITHUB_CLIENT_ID" --data-file=- --project="$PROJECT"
echo -n "<secret>" | gcloud secrets versions add "${PREFIX}-GITHUB_CLIENT_SECRET" --data-file=- --project="$PROJECT"
echo -n "user@example.com" | gcloud secrets versions add "${PREFIX}-ADMIN_EMAILS" --data-file=- --project="$PROJECT"

# Slack
echo -n "<token>" | gcloud secrets versions add "${PREFIX}-SLACK_BOT_TOKEN" --data-file=- --project="$PROJECT"
echo -n "<secret>" | gcloud secrets versions add "${PREFIX}-SLACK_SIGNING_SECRET" --data-file=- --project="$PROJECT"
echo -n "<token>" | gcloud secrets versions add "${PREFIX}-SLACK_APP_TOKEN" --data-file=- --project="$PROJECT"

# Optional
echo -n "<key>" | gcloud secrets versions add "${PREFIX}-TAVILY_API_KEY" --data-file=- --project="$PROJECT"
echo -n "<key>" | gcloud secrets versions add "${PREFIX}-RESEND_API_KEY" --data-file=- --project="$PROJECT"
echo -n "<key>" | gcloud secrets versions add "${PREFIX}-LANGSMITH_API_KEY" --data-file=- --project="$PROJECT"
echo -n "<key>" | gcloud secrets versions add "${PREFIX}-VOYAGE_API_KEY" --data-file=- --project="$PROJECT"
echo -n "<key>" | gcloud secrets versions add "${PREFIX}-GOOGLE_AI_API_KEY" --data-file=- --project="$PROJECT"
```

> The `DATABASE_URL` for Cloud Run uses the Unix socket path (`/cloudsql/<connection-name>`) since Cloud SQL Auth Proxy runs as a sidecar.

## 7. Initial Data Ingestion

After deployment, trigger ingestion to populate the vector database:

```bash
# Via Cloud Scheduler (trigger the ingestion cron manually)
gcloud scheduler jobs run "usopc-staging-cron-ingestion" \
  --project="usopc-athlete-support-staging" \
  --location="us-central1"
```

Or wait for the automated schedule (daily at 3 AM UTC).

## 8. Source Discovery

Discovery runs automatically every Sunday at 2 AM UTC via Cloud Scheduler.

### Manual Trigger

```bash
gcloud scheduler jobs run "usopc-staging-cron-discovery" \
  --project="usopc-athlete-support-staging" \
  --location="us-central1"
```

### Configuration

Discovery sources are defined in `data/discovery-config.json`. See the file for domain lists and search query configuration.

## Infrastructure Overview

Pulumi (`infra/gcp/index.ts`) creates:

| Resource                             | Purpose                                         |
| ------------------------------------ | ----------------------------------------------- |
| Cloud Run (web, slack, worker)       | Application services                            |
| Cloud SQL (PostgreSQL 16 + pgvector) | Database with vector search                     |
| Artifact Registry                    | Docker image storage                            |
| Secret Manager                       | API keys and credentials                        |
| Cloud Storage                        | Document storage                                |
| Pub/Sub                              | Ingestion and discovery feed queues (with DLQs) |
| Cloud Scheduler                      | Cron jobs for discovery and ingestion           |
| Monitoring + Alerting                | Error rate and DLQ alerts                       |

### Scaling

|                     | Staging                            | Production                         |
| ------------------- | ---------------------------------- | ---------------------------------- |
| Cloud SQL           | `db-custom-2-7680` (2 CPU, 7.5 GB) | `db-custom-4-15360` (4 CPU, 15 GB) |
| Min instances       | 0                                  | 1                                  |
| Max instances       | 2                                  | 10                                 |
| DB availability     | Zonal                              | Regional (HA)                      |
| Deletion protection | Off                                | On                                 |

## Troubleshooting

### View Cloud Run Logs

```bash
gcloud run services logs read "usopc-staging-web" \
  --project="usopc-athlete-support-staging" \
  --region="us-central1" \
  --limit=50
```

### Check Service Health

```bash
WEB_URL=$(gcloud run services describe "usopc-staging-web" \
  --project="usopc-athlete-support-staging" \
  --region="us-central1" \
  --format="value(status.url)")

curl -sf "$WEB_URL/api/health"
```

### Connect to Cloud SQL Locally

```bash
# Install Cloud SQL Auth Proxy
brew install cloud-sql-proxy

# Start proxy (get connection name from Pulumi output)
cloud-sql-proxy "usopc-athlete-support-staging:us-central1:<instance-name>" --port 5432

# Connect via psql in another terminal
psql "postgresql://app:<password>@localhost:5432/usopc_athlete_support"
```

### Re-deploy a Single Service

Use the workflow dispatch trigger and select the environment, or push to `main` for staging.

### DLQ Messages

Check for failed Pub/Sub messages:

```bash
gcloud pubsub subscriptions pull "usopc-staging-ingestion-dlq-sub" \
  --project="usopc-athlete-support-staging" \
  --auto-ack \
  --limit=10
```
