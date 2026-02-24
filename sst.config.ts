/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "usopc-athlete-support",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: { region: "us-east-1", profile: "default" },
      },
    };
  },
  async run() {
    const stage = $app.stage;
    const isProd = stage === "production";

    // Secrets
    const anthropicKey = new sst.Secret("AnthropicApiKey");
    const openaiKey = new sst.Secret("OpenaiApiKey");
    const googleKey = new sst.Secret("GoogleApiKey");
    const tavilyKey = new sst.Secret("TavilyApiKey");
    const langchainKey = new sst.Secret("LangchainApiKey");
    const slackBotToken = new sst.Secret("SlackBotToken");
    const slackSigningSecret = new sst.Secret("SlackSigningSecret");
    // Auth secrets (admin OAuth)
    const authSecret = new sst.Secret("AuthSecret");
    const gitHubClientId = new sst.Secret("GitHubClientId");
    const gitHubClientSecret = new sst.Secret("GitHubClientSecret");
    const adminEmails = new sst.Secret("AdminEmails");
    // Email magic-link auth via Resend
    const resendApiKey = new sst.Secret("ResendApiKey");
    // Optional config with default value
    const conversationMaxTurns = new sst.Secret("ConversationMaxTurns", "5");

    // Database
    // Deployed stages (staging, production): Neon Postgres via SST secret
    // Local dev: Docker Postgres container via DATABASE_URL env var or fallback
    const isLocal = !isProd && stage !== "staging";
    const databaseUrlSecret = new sst.Secret(
      "DatabaseUrl",
      isLocal
        ? "postgresql://postgres:postgres@localhost:5432/usopc_athlete_support"
        : undefined,
    );

    const linkables: sst.Linkable<any>[] = [
      anthropicKey,
      openaiKey,
      googleKey,
      tavilyKey,
      langchainKey,
      databaseUrlSecret,
    ];

    // DynamoDB single-table for all app entities (OneTable pattern)
    const appTable = new sst.aws.Dynamo("AppTable", {
      fields: {
        pk: "string",
        sk: "string",
        ngbId: "string",
        enabled: "string",
        gsi1pk: "string",
        gsi1sk: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      globalIndexes: {
        "ngbId-index": { hashKey: "ngbId", rangeKey: "pk" },
        "enabled-priority-index": { hashKey: "enabled", rangeKey: "sk" },
        gsi1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
      },
      ttl: "ttl",
    });

    // S3 bucket for document storage (cache/archive)
    const documentsBucket = new sst.aws.Bucket("DocumentsBucket", {
      versioning: true,
    });

    // Custom domains — only for deployed stages (staging, production).
    // Local dev stages use raw AWS URLs (no domain config needed).
    const isDeployed = isProd || stage === "staging";
    const domainZone = "rosinbum.org";

    // Slack bot webhook — $default catches /slack/events, /slack/commands,
    // and /slack/interactions so all Slack endpoints route to one Lambda.
    const slackApi = new sst.aws.ApiGatewayV2("SlackApi", {
      domain: isDeployed
        ? {
            name: isProd
              ? `slack.${domainZone}`
              : `slack-${stage}.${domainZone}`,
            dns: sst.aws.dns(),
          }
        : undefined,
    });
    slackApi.route("$default", {
      handler: "apps/slack/src/index.handler",
      link: [...linkables, slackBotToken, slackSigningSecret, appTable],
      timeout: "120 seconds",
      memory: "512 MB",
    });

    // Discovery feed queue — processes discovered URLs through the evaluation
    // pipeline asynchronously (metadata eval → content extraction → content eval).
    // Available in all stages so both the agent (Web) and discovery cron can publish.
    const discoveryFeedDlq = new sst.aws.Queue("DiscoveryFeedDLQ");
    const discoveryFeedQueue = new sst.aws.Queue("DiscoveryFeedQueue", {
      visibilityTimeout: "10 minutes",
      dlq: {
        queue: discoveryFeedDlq.arn,
        retry: 2,
      },
    });

    discoveryFeedQueue.subscribe(
      {
        handler: "packages/ingestion/src/discoveryFeedWorker.handler",
        link: [...linkables, appTable],
        timeout: "10 minutes",
        memory: "512 MB",
      },
      {
        batch: { size: 1 },
      },
    );

    // Source discovery (weekly) - production only
    if (isProd) {
      new sst.aws.Cron("DiscoveryCron", {
        schedule: "cron(0 2 ? * MON *)", // Every Monday at 2 AM UTC
        job: {
          handler: "packages/ingestion/src/functions/discovery.handler",
          link: [...linkables, appTable, discoveryFeedQueue],
          timeout: "15 minutes",
          memory: "1024 MB",
          permissions: [
            {
              actions: ["ses:SendEmail", "ses:SendRawEmail"],
              resources: ["*"],
            },
          ],
          environment: {
            TAVILY_MONTHLY_BUDGET: process.env.TAVILY_MONTHLY_BUDGET ?? "1000",
            ANTHROPIC_MONTHLY_BUDGET:
              process.env.ANTHROPIC_MONTHLY_BUDGET ?? "10",
            SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL ?? "",
            NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL ?? "",
            SES_FROM_EMAIL: process.env.SES_FROM_EMAIL ?? "noreply@usopc.org",
          },
        },
      });
    }

    // Document ingestion (weekly) - production only
    // Declared before Web so the queue can be linked conditionally
    let ingestionQueue: sst.aws.Queue | undefined;

    if (isProd) {
      // Dead-letter queue (must also be FIFO to match main queue)
      const ingestionDlq = new sst.aws.Queue("IngestionDLQ", {
        fifo: true,
      });

      // Main ingestion queue
      ingestionQueue = new sst.aws.Queue("IngestionQueue", {
        fifo: {
          contentBasedDeduplication: true,
        },
        visibilityTimeout: "15 minutes",
        dlq: {
          queue: ingestionDlq.arn,
          retry: 2,
        },
      });

      // Worker: processes one source per SQS message
      ingestionQueue.subscribe(
        {
          handler: "packages/ingestion/src/worker.handler",
          link: [...linkables, appTable, documentsBucket],
          timeout: "15 minutes",
          memory: "1024 MB",
        },
        {
          batch: { size: 1 },
        },
      );

      // Coordinator: cron checks for changes, enqueues to SQS
      new sst.aws.Cron("IngestionCron", {
        schedule: "rate(7 days)",
        job: {
          handler: "packages/ingestion/src/cron.handler",
          link: [...linkables, ingestionQueue, appTable, documentsBucket],
          timeout: "5 minutes",
          memory: "512 MB",
        },
      });
    }

    // Next.js web app
    const web = new sst.aws.Nextjs("Web", {
      path: "apps/web",
      domain: isDeployed
        ? {
            name: isProd ? `app.${domainZone}` : `${stage}.${domainZone}`,
            dns: sst.aws.dns(),
          }
        : undefined,
      link: [
        ...linkables,
        conversationMaxTurns,
        authSecret,
        gitHubClientId,
        gitHubClientSecret,
        adminEmails,
        resendApiKey,
        appTable,
        documentsBucket,
        discoveryFeedQueue,
        ...(ingestionQueue ? [ingestionQueue] : []),
      ],
    });

    return {
      webUrl: web.url,
      slackUrl: slackApi.url,
      sourceConfigTableName: appTable.name,
      documentsBucketName: documentsBucket.name,
    };
  },
});
