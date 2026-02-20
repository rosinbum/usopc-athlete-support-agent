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
    const tavilyKey = new sst.Secret("TavilyApiKey");
    const langchainKey = new sst.Secret("LangchainApiKey");
    const slackBotToken = new sst.Secret("SlackBotToken");
    const slackSigningSecret = new sst.Secret("SlackSigningSecret");
    // Auth secrets (admin OAuth)
    const authSecret = new sst.Secret("AuthSecret");
    const gitHubClientId = new sst.Secret("GitHubClientId");
    const gitHubClientSecret = new sst.Secret("GitHubClientSecret");
    const adminEmails = new sst.Secret("AdminEmails");
    // Optional config with default value
    const conversationMaxTurns = new sst.Secret("ConversationMaxTurns", "5");
    // API key for tRPC protectedProcedure auth — empty default allows unauthenticated
    // local dev; set a strong value in production via `sst secret set TrpcApiKey`
    const trpcApiKey = new sst.Secret("TrpcApiKey", "");

    // Database
    // Production: Aurora Serverless v2 with pgvector
    // Dev stages: Use local Docker postgres via DATABASE_URL env var
    const linkables: sst.Linkable<any>[] = [
      anthropicKey,
      openaiKey,
      tavilyKey,
      langchainKey,
    ];

    let databaseUrl: string | undefined;
    let database: sst.aws.Postgres | undefined;

    if (isProd) {
      database = new sst.aws.Postgres("Database", {
        scaling: {
          min: "0.5 ACU",
          max: "4 ACU",
        },
      });
      linkables.push(database);
    } else {
      // Dev stages use local Docker postgres (docker-compose.yml)
      databaseUrl =
        "postgresql://postgres:postgres@localhost:5432/usopc_athlete_support";
    }

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
    });

    // S3 bucket for document storage (cache/archive)
    const documentsBucket = new sst.aws.Bucket("DocumentsBucket", {
      versioning: true,
    });

    // tRPC API — throttle at the API Gateway layer so rate limits are enforced
    // across all Lambda instances and survive cold starts.
    // 100 req/s burst, 60 req/s steady state (per stage/account, not per-client).
    const api = new sst.aws.ApiGatewayV2("Api", {
      throttle: {
        burst: 100,
        rate: 60,
      },
    });
    // Slack bot webhook
    const slackApi = new sst.aws.ApiGatewayV2("SlackApi");
    slackApi.route("POST /slack/events", {
      handler: "apps/slack/src/index.handler",
      link: [...linkables, slackBotToken, slackSigningSecret],
      timeout: "120 seconds",
      memory: "512 MB",
      environment: {
        ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
      },
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
          link: [...linkables, database!, appTable, discoveryFeedQueue],
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
          link: [...linkables, database!, appTable, documentsBucket],
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
          link: [
            ...linkables,
            database!,
            ingestionQueue,
            appTable,
            documentsBucket,
          ],
          timeout: "5 minutes",
          memory: "512 MB",
        },
      });
    }

    // Next.js web app
    const web = new sst.aws.Nextjs("Web", {
      path: "apps/web",
      link: [
        ...linkables,
        api,
        conversationMaxTurns,
        authSecret,
        gitHubClientId,
        gitHubClientSecret,
        adminEmails,
        appTable,
        documentsBucket,
        discoveryFeedQueue,
        ...(ingestionQueue ? [ingestionQueue] : []),
      ],
      environment: {
        NEXT_PUBLIC_API_URL: api.url,
        ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
      },
    });

    // Register the tRPC API route after Web is created so we can pass web.url
    // as ALLOWED_ORIGIN for CORS. Hono's cors middleware reads this env var to
    // restrict cross-origin requests to the web app's CloudFront origin only.
    api.route("$default", {
      handler: "apps/api/src/lambda.handler",
      link: [...linkables, conversationMaxTurns, appTable, trpcApiKey],
      timeout: "120 seconds",
      memory: "512 MB",
      environment: {
        ALLOWED_ORIGIN: web.url,
        ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
      },
    });

    return {
      apiUrl: api.url,
      webUrl: web.url,
      slackUrl: slackApi.url,
      sourceConfigTableName: appTable.name,
      documentsBucketName: documentsBucket.name,
    };
  },
});
