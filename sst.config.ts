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
    const slackBotToken = new sst.Secret("SlackBotToken");
    const slackSigningSecret = new sst.Secret("SlackSigningSecret");

    // Database
    // Production: Aurora Serverless v2 with pgvector
    // Dev stages: Use local Docker postgres via DATABASE_URL env var
    const linkables: sst.Linkable<any>[] = [
      anthropicKey,
      openaiKey,
      tavilyKey,
    ];

    let databaseUrl: string | undefined;

    if (isProd) {
      const database = new sst.aws.Postgres("Database", {
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

    // tRPC API
    const api = new sst.aws.ApiGatewayV2("Api");
    api.route("$default", {
      handler: "apps/api/src/lambda.handler",
      link: linkables,
      timeout: "120 seconds",
      memory: "512 MB",
      environment: {
        ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
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

    // Next.js web app
    const web = new sst.aws.Nextjs("Web", {
      path: "apps/web",
      link: [...linkables, api],
      environment: {
        NEXT_PUBLIC_API_URL: api.url,
        ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
      },
    });

    // Document ingestion cron (weekly) - production only
    if (isProd) {
      new sst.aws.Cron("IngestionCron", {
        schedule: "rate(7 days)",
        job: {
          handler: "packages/ingestion/src/cron.handler",
          link: linkables,
          timeout: "15 minutes",
          memory: "1024 MB",
        },
      });
    }

    return {
      apiUrl: api.url,
      webUrl: web.url,
      slackUrl: slackApi.url,
    };
  },
});
