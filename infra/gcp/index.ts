import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const config = new pulumi.Config("usopc");
const gcpConfig = new pulumi.Config("gcp");

const environment = config.require("environment");
const project = gcpConfig.require("project");
const region = gcpConfig.require("region");
const dbTier = config.require("dbTier");
const minInstances = parseInt(config.require("minInstances"), 10);
const maxInstances = parseInt(config.require("maxInstances"), 10);

const prefix = `usopc-${environment}`;

// ---------------------------------------------------------------------------
// Enable APIs
// ---------------------------------------------------------------------------

const apis = [
  "run.googleapis.com",
  "sqladmin.googleapis.com",
  "secretmanager.googleapis.com",
  "pubsub.googleapis.com",
  "storage.googleapis.com",
  "artifactregistry.googleapis.com",
  "cloudscheduler.googleapis.com",
  "monitoring.googleapis.com",
];

const enabledApis = apis.map(
  (api) =>
    new gcp.projects.Service(`enable-${api}`, {
      project,
      service: api,
      disableOnDestroy: false,
    }),
);

// ---------------------------------------------------------------------------
// Service Account
// ---------------------------------------------------------------------------

const serviceAccount = new gcp.serviceaccount.Account(`${prefix}-sa`, {
  accountId: `${prefix}-sa`,
  displayName: `USOPC ${environment} Service Account`,
  project,
});

// Grant necessary roles
const roles = [
  "roles/cloudsql.client",
  "roles/secretmanager.secretAccessor",
  "roles/pubsub.publisher",
  "roles/pubsub.subscriber",
  "roles/storage.objectAdmin",
  "roles/monitoring.metricWriter",
  "roles/logging.logWriter",
  "roles/aiplatform.user", // Vertex AI
];

roles.forEach(
  (role, i) =>
    new gcp.projects.IAMMember(`${prefix}-sa-role-${i}`, {
      project,
      role,
      member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`,
    }),
);

// ---------------------------------------------------------------------------
// Artifact Registry
// ---------------------------------------------------------------------------

const registry = new gcp.artifactregistry.Repository(`${prefix}-registry`, {
  repositoryId: `${prefix}-images`,
  format: "DOCKER",
  location: region,
  project,
  description: `Docker images for USOPC ${environment}`,
});

// ---------------------------------------------------------------------------
// Cloud SQL (PostgreSQL + pgvector)
// ---------------------------------------------------------------------------

const dbInstance = new gcp.sql.DatabaseInstance(`${prefix}-db`, {
  databaseVersion: "POSTGRES_16",
  region,
  project,
  settings: {
    tier: dbTier,
    availabilityType: environment === "production" ? "REGIONAL" : "ZONAL",
    backupConfiguration: {
      enabled: true,
      startTime: "03:00",
      pointInTimeRecoveryEnabled: environment === "production",
    },
    databaseFlags: [
      // Enable pgvector via shared_preload_libraries
      { name: "cloudsql.enable_pgvector", value: "on" },
    ],
    ipConfiguration: {
      ipv4Enabled: false,
      privateNetwork: undefined, // Will use Cloud SQL Auth Proxy via Cloud Run
    },
    insightsConfig: {
      queryInsightsEnabled: true,
      queryStringLength: 4096,
    },
  },
  deletionProtection: environment === "production",
});

const database = new gcp.sql.Database(`${prefix}-db-main`, {
  name: "usopc_athlete_support",
  instance: dbInstance.name,
  project,
});

const dbUser = new gcp.sql.User(`${prefix}-db-user`, {
  name: "app",
  instance: dbInstance.name,
  password: config.requireSecret("dbPassword"),
  project,
});

// ---------------------------------------------------------------------------
// Secret Manager
// ---------------------------------------------------------------------------

const secrets = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "TAVILY_API_KEY",
  "RESEND_API_KEY",
  "AUTH_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "ADMIN_EMAILS",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "SLACK_APP_TOKEN",
  "LANGSMITH_API_KEY",
  "VOYAGE_API_KEY",
  "GOOGLE_AI_API_KEY",
];

const secretResources = secrets.map(
  (name) =>
    new gcp.secretmanager.Secret(`${prefix}-secret-${name}`, {
      secretId: `${prefix}-${name}`,
      replication: { auto: {} },
      project,
    }),
);

// Grant the service account access to all secrets
secretResources.forEach(
  (secret, i) =>
    new gcp.secretmanager.SecretIamMember(
      `${prefix}-secret-access-${i}`,
      {
        secretId: secret.secretId,
        role: "roles/secretmanager.secretAccessor",
        member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`,
        project,
      },
    ),
);

// ---------------------------------------------------------------------------
// Cloud Storage (Documents Bucket)
// ---------------------------------------------------------------------------

const documentsBucket = new gcp.storage.Bucket(`${prefix}-documents`, {
  name: `${prefix}-documents`,
  location: region,
  project,
  uniformBucketLevelAccess: true,
  versioning: { enabled: true },
  lifecycleRules: [
    {
      action: { type: "Delete" },
      condition: { numNewerVersions: 5 },
    },
  ],
});

// ---------------------------------------------------------------------------
// Pub/Sub Topics + Subscriptions
// ---------------------------------------------------------------------------

// Ingestion queue
const ingestionTopic = new gcp.pubsub.Topic(`${prefix}-ingestion`, {
  name: `${prefix}-ingestion`,
  project,
});

const ingestionDlqTopic = new gcp.pubsub.Topic(`${prefix}-ingestion-dlq`, {
  name: `${prefix}-ingestion-dlq`,
  project,
});

// Discovery feed queue
const discoveryFeedTopic = new gcp.pubsub.Topic(`${prefix}-discovery-feed`, {
  name: `${prefix}-discovery-feed`,
  project,
});

const discoveryFeedDlqTopic = new gcp.pubsub.Topic(
  `${prefix}-discovery-feed-dlq`,
  {
    name: `${prefix}-discovery-feed-dlq`,
    project,
  },
);

// ---------------------------------------------------------------------------
// Cloud Run Services
// ---------------------------------------------------------------------------

const registryUrl = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${registry.repositoryId}`;

// Helper: build a secret env var referencing Secret Manager
function secretEnv(envName: string, secretName: string) {
  return {
    name: envName,
    valueSource: {
      secretKeyRef: { secret: `${prefix}-${secretName}`, version: "latest" },
    },
  };
}

// Cloud SQL volume shared across services
const cloudSqlVolume = {
  name: "cloudsql",
  cloudSqlInstance: { instances: [dbInstance.connectionName] },
};

const cloudSqlMount = { name: "cloudsql", mountPath: "/cloudsql" };

// Shared secret env vars (needed by all services via @usopc/core)
const coreSecretEnvs = [
  secretEnv("DATABASE_URL", "DATABASE_URL"),
  secretEnv("OPENAI_API_KEY", "OPENAI_API_KEY"),
  secretEnv("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
  secretEnv("LANGSMITH_API_KEY", "LANGSMITH_API_KEY"),
  secretEnv("VOYAGE_API_KEY", "VOYAGE_API_KEY"),
  secretEnv("GOOGLE_AI_API_KEY", "GOOGLE_AI_API_KEY"),
];

// Web app
const webService = new gcp.cloudrunv2.Service(`${prefix}-web`, {
  name: `${prefix}-web`,
  location: region,
  project,
  template: {
    serviceAccount: serviceAccount.email,
    scaling: {
      minInstanceCount: minInstances,
      maxInstanceCount: maxInstances,
    },
    volumes: [cloudSqlVolume],
    containers: [
      {
        image: pulumi.interpolate`${registryUrl}/web:latest`,
        ports: [{ containerPort: 8080 }],
        resources: {
          limits: { cpu: "2", memory: "1Gi" },
        },
        volumeMounts: [cloudSqlMount],
        envs: [
          { name: "NODE_ENV", value: "production" },
          { name: "REQUIRE_AUTH", value: "true" },
          { name: "STORAGE_PROVIDER", value: "gcs" },
          { name: "QUEUE_PROVIDER", value: "pubsub" },
          {
            name: "DOCUMENTS_BUCKET_NAME",
            value: documentsBucket.name,
          },
          {
            name: "INGESTION_QUEUE_URL",
            value: ingestionTopic.name,
          },
          {
            name: "DISCOVERY_FEED_QUEUE_URL",
            value: discoveryFeedTopic.name,
          },
          ...coreSecretEnvs,
          secretEnv("AUTH_SECRET", "AUTH_SECRET"),
          secretEnv("GITHUB_CLIENT_ID", "GITHUB_CLIENT_ID"),
          secretEnv("GITHUB_CLIENT_SECRET", "GITHUB_CLIENT_SECRET"),
          secretEnv("ADMIN_EMAILS", "ADMIN_EMAILS"),
          secretEnv("RESEND_API_KEY", "RESEND_API_KEY"),
        ],
      },
    ],
  },
});

// Slack bot
const slackService = new gcp.cloudrunv2.Service(`${prefix}-slack`, {
  name: `${prefix}-slack`,
  location: region,
  project,
  template: {
    serviceAccount: serviceAccount.email,
    scaling: {
      minInstanceCount: minInstances,
      maxInstanceCount: 2,
    },
    volumes: [cloudSqlVolume],
    containers: [
      {
        image: pulumi.interpolate`${registryUrl}/slack:latest`,
        ports: [{ containerPort: 8080 }],
        resources: {
          limits: { cpu: "1", memory: "512Mi" },
        },
        volumeMounts: [cloudSqlMount],
        envs: [
          { name: "NODE_ENV", value: "production" },
          ...coreSecretEnvs,
          secretEnv("SLACK_BOT_TOKEN", "SLACK_BOT_TOKEN"),
          secretEnv("SLACK_SIGNING_SECRET", "SLACK_SIGNING_SECRET"),
          secretEnv("SLACK_APP_TOKEN", "SLACK_APP_TOKEN"),
        ],
      },
    ],
  },
});

// Worker (consolidated ingestion + discovery)
const workerService = new gcp.cloudrunv2.Service(`${prefix}-worker`, {
  name: `${prefix}-worker`,
  location: region,
  project,
  template: {
    serviceAccount: serviceAccount.email,
    scaling: {
      minInstanceCount: 0,
      maxInstanceCount: maxInstances,
    },
    timeout: "900s", // 15 minutes for long ingestion tasks
    volumes: [cloudSqlVolume],
    containers: [
      {
        image: pulumi.interpolate`${registryUrl}/worker:latest`,
        ports: [{ containerPort: 8080 }],
        resources: {
          limits: { cpu: "2", memory: "2Gi" },
        },
        volumeMounts: [cloudSqlMount],
        envs: [
          { name: "NODE_ENV", value: "production" },
          { name: "STORAGE_PROVIDER", value: "gcs" },
          { name: "QUEUE_PROVIDER", value: "pubsub" },
          {
            name: "DOCUMENTS_BUCKET_NAME",
            value: documentsBucket.name,
          },
          {
            name: "INGESTION_QUEUE_URL",
            value: ingestionTopic.name,
          },
          {
            name: "DISCOVERY_FEED_QUEUE_URL",
            value: discoveryFeedTopic.name,
          },
          ...coreSecretEnvs,
          secretEnv("TAVILY_API_KEY", "TAVILY_API_KEY"),
        ],
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// Pub/Sub Push Subscriptions (to worker)
// ---------------------------------------------------------------------------

const ingestionSubscription = new gcp.pubsub.Subscription(
  `${prefix}-ingestion-push`,
  {
    name: `${prefix}-ingestion-push`,
    topic: ingestionTopic.name,
    project,
    pushConfig: {
      pushEndpoint: pulumi.interpolate`${workerService.uri}/ingestion`,
      oidcToken: {
        serviceAccountEmail: serviceAccount.email,
      },
    },
    ackDeadlineSeconds: 600, // 10 minutes
    deadLetterPolicy: {
      deadLetterTopic: ingestionDlqTopic.id,
      maxDeliveryAttempts: 5,
    },
    retryPolicy: {
      minimumBackoff: "10s",
      maximumBackoff: "600s",
    },
  },
);

const discoveryFeedSubscription = new gcp.pubsub.Subscription(
  `${prefix}-discovery-feed-push`,
  {
    name: `${prefix}-discovery-feed-push`,
    topic: discoveryFeedTopic.name,
    project,
    pushConfig: {
      pushEndpoint: pulumi.interpolate`${workerService.uri}/discovery-feed`,
      oidcToken: {
        serviceAccountEmail: serviceAccount.email,
      },
    },
    ackDeadlineSeconds: 300,
    deadLetterPolicy: {
      deadLetterTopic: discoveryFeedDlqTopic.id,
      maxDeliveryAttempts: 5,
    },
    retryPolicy: {
      minimumBackoff: "10s",
      maximumBackoff: "300s",
    },
  },
);

// ---------------------------------------------------------------------------
// Cloud Scheduler Jobs
// ---------------------------------------------------------------------------

const schedulerServiceAccount = serviceAccount;

// Discovery cron — weekly on Sundays at 2am UTC
new gcp.cloudscheduler.Job(`${prefix}-cron-discovery`, {
  name: `${prefix}-cron-discovery`,
  schedule: "0 2 * * 0",
  timeZone: "UTC",
  region,
  project,
  httpTarget: {
    httpMethod: "POST",
    uri: pulumi.interpolate`${workerService.uri}/cron/discovery`,
    oidcToken: {
      serviceAccountEmail: schedulerServiceAccount.email,
    },
  },
});

// Ingestion cron — daily at 3am UTC
new gcp.cloudscheduler.Job(`${prefix}-cron-ingestion`, {
  name: `${prefix}-cron-ingestion`,
  schedule: "0 3 * * *",
  timeZone: "UTC",
  region,
  project,
  httpTarget: {
    httpMethod: "POST",
    uri: pulumi.interpolate`${workerService.uri}/cron/ingestion`,
    oidcToken: {
      serviceAccountEmail: schedulerServiceAccount.email,
    },
  },
});

// ---------------------------------------------------------------------------
// Monitoring / Alerting
// ---------------------------------------------------------------------------

const notificationChannel = new gcp.monitoring.NotificationChannel(
  `${prefix}-email-alerts`,
  {
    displayName: `USOPC ${environment} Email Alerts`,
    type: "email",
    labels: {
      email_address: config.get("alertEmail") || "alerts@usopc.org",
    },
    project,
  },
);

// Alert on high error rate
new gcp.monitoring.AlertPolicy(`${prefix}-error-rate`, {
  displayName: `${prefix} — High Error Rate`,
  combiner: "OR",
  conditions: [
    {
      displayName: "Cloud Run 5xx error rate > 5%",
      conditionThreshold: {
        filter: pulumi.interpolate`resource.type = "cloud_run_revision" AND metric.type = "run.googleapis.com/request_count" AND metric.labels.response_code_class = "5xx"`,
        comparison: "COMPARISON_GT",
        thresholdValue: 5,
        duration: "300s",
        aggregations: [
          {
            alignmentPeriod: "300s",
            perSeriesAligner: "ALIGN_RATE",
          },
        ],
      },
    },
  ],
  notificationChannels: [notificationChannel.name],
  project,
});

// Alert on DLQ messages
new gcp.monitoring.AlertPolicy(`${prefix}-dlq-messages`, {
  displayName: `${prefix} — DLQ Messages`,
  combiner: "OR",
  conditions: [
    {
      displayName: "Messages in DLQ topic",
      conditionThreshold: {
        filter: pulumi.interpolate`resource.type = "pubsub_topic" AND (resource.labels.topic_id = "${ingestionDlqTopic.name}" OR resource.labels.topic_id = "${discoveryFeedDlqTopic.name}") AND metric.type = "pubsub.googleapis.com/topic/send_message_operation_count"`,
        comparison: "COMPARISON_GT",
        thresholdValue: 0,
        duration: "60s",
        aggregations: [
          {
            alignmentPeriod: "300s",
            perSeriesAligner: "ALIGN_SUM",
          },
        ],
      },
    },
  ],
  notificationChannels: [notificationChannel.name],
  project,
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const webServiceUrl = webService.uri;
export const slackServiceUrl = slackService.uri;
export const workerServiceUrl = workerService.uri;
export const documentsBucketName = documentsBucket.name;
export const dbInstanceConnectionName = dbInstance.connectionName;
export const registryRepositoryUrl = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${registry.repositoryId}`;
