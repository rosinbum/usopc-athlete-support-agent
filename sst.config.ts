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
      transform: {
        table: (args) => {
          args.pointInTimeRecovery = { enabled: true };
        },
      },
    });

    // DynamoDB table for NextAuth adapter (users, accounts, verification tokens)
    const authTable = new sst.aws.Dynamo("AuthTable", {
      fields: {
        pk: "string",
        sk: "string",
        GSI1PK: "string",
        GSI1SK: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      globalIndexes: {
        GSI1: { hashKey: "GSI1PK", rangeKey: "GSI1SK" },
      },
      ttl: "expires",
    });

    // S3 bucket for document storage (cache/archive)
    const documentsBucket = new sst.aws.Bucket("DocumentsBucket", {
      versioning: true,
    });

    // Custom domains — only for deployed stages (staging, production).
    // Local dev stages use raw AWS URLs (no domain config needed).
    const isDeployed = isProd || stage === "staging";
    const domainZone = "athlete-agent.rosinbum.org";

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
    const slackRoute = slackApi.route("$default", {
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

    const discoveryFeedWorkerSub = discoveryFeedQueue.subscribe(
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
    // Document ingestion (weekly) - production only
    // Declared before Web so the queue can be linked conditionally
    let ingestionQueue: sst.aws.Queue | undefined;
    let alarmTopic: aws.sns.Topic | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let monitoringRefs: Record<string, any> | undefined;

    if (isProd) {
      const discoveryCron = new sst.aws.Cron("DiscoveryCron", {
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
      const ingestionWorkerSub = ingestionQueue.subscribe(
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
      const ingestionCron = new sst.aws.Cron("IngestionCron", {
        schedule: "rate(7 days)",
        job: {
          handler: "packages/ingestion/src/cron.handler",
          link: [...linkables, ingestionQueue, appTable, documentsBucket],
          timeout: "5 minutes",
          memory: "512 MB",
        },
      });

      // --- Monitoring ---

      alarmTopic = new aws.sns.Topic("AlarmTopic", {
        displayName: "USOPC Athlete Support - Production Alarms",
      });

      const notificationEmail = process.env.NOTIFICATION_EMAIL;
      if (notificationEmail) {
        new aws.sns.TopicSubscription("AlarmEmailSub", {
          topic: alarmTopic.arn,
          protocol: "email",
          endpoint: notificationEmail,
        });
      }

      // Slack Lambda alarms
      new aws.cloudwatch.MetricAlarm("SlackErrorsAlarm", {
        alarmDescription: "Slack Lambda errors > 5 in 5 minutes",
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensions: { FunctionName: slackRoute.nodes.function.name },
        statistic: "Sum",
        period: 300,
        evaluationPeriods: 1,
        threshold: 5,
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      new aws.cloudwatch.MetricAlarm("SlackDurationAlarm", {
        alarmDescription: "Slack Lambda p99 duration > 100s",
        namespace: "AWS/Lambda",
        metricName: "Duration",
        dimensions: { FunctionName: slackRoute.nodes.function.name },
        extendedStatistic: "p99",
        period: 300,
        evaluationPeriods: 2,
        threshold: 100_000, // milliseconds
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      // Discovery feed worker alarm
      new aws.cloudwatch.MetricAlarm("DiscoveryWorkerErrorsAlarm", {
        alarmDescription: "Discovery feed worker errors > 3 in 5 minutes",
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensions: {
          FunctionName: discoveryFeedWorkerSub.nodes.function.name,
        },
        statistic: "Sum",
        period: 300,
        evaluationPeriods: 1,
        threshold: 3,
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      // Discovery cron alarm
      new aws.cloudwatch.MetricAlarm("DiscoveryCronErrorsAlarm", {
        alarmDescription: "Discovery cron Lambda errors > 0",
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensions: { FunctionName: discoveryCron.nodes.function.name },
        statistic: "Sum",
        period: 300,
        evaluationPeriods: 1,
        threshold: 0,
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      // Ingestion worker alarm
      new aws.cloudwatch.MetricAlarm("IngestionWorkerErrorsAlarm", {
        alarmDescription: "Ingestion worker errors > 3 in 5 minutes",
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensions: { FunctionName: ingestionWorkerSub.nodes.function.name },
        statistic: "Sum",
        period: 300,
        evaluationPeriods: 1,
        threshold: 3,
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      // Ingestion cron alarm
      new aws.cloudwatch.MetricAlarm("IngestionCronErrorsAlarm", {
        alarmDescription: "Ingestion cron Lambda errors > 0",
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensions: { FunctionName: ingestionCron.nodes.function.name },
        statistic: "Sum",
        period: 300,
        evaluationPeriods: 1,
        threshold: 0,
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      // DLQ depth alarms
      new aws.cloudwatch.MetricAlarm("DiscoveryDlqDepthAlarm", {
        alarmDescription: "Discovery feed DLQ has messages",
        namespace: "AWS/SQS",
        metricName: "ApproximateNumberOfMessagesVisible",
        dimensions: { QueueName: discoveryFeedDlq.nodes.queue.name },
        statistic: "Sum",
        period: 300,
        evaluationPeriods: 1,
        threshold: 0,
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      new aws.cloudwatch.MetricAlarm("IngestionDlqDepthAlarm", {
        alarmDescription: "Ingestion DLQ has messages",
        namespace: "AWS/SQS",
        metricName: "ApproximateNumberOfMessagesVisible",
        dimensions: { QueueName: ingestionDlq.nodes.queue.name },
        statistic: "Sum",
        period: 300,
        evaluationPeriods: 1,
        threshold: 0,
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      // DynamoDB throttling alarm
      new aws.cloudwatch.MetricAlarm("DynamoThrottlingAlarm", {
        alarmDescription: "DynamoDB throttled requests > 0",
        namespace: "AWS/DynamoDB",
        metricName: "ThrottledRequests",
        dimensions: { TableName: appTable.name },
        statistic: "Sum",
        period: 300,
        evaluationPeriods: 1,
        threshold: 0,
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      // Save references for dashboard (built after web is declared)
      monitoringRefs = {
        slackFn: slackRoute.nodes.function.name,
        discoveryWorkerFn: discoveryFeedWorkerSub.nodes.function.name,
        discoveryCronFn: discoveryCron.nodes.function.name,
        ingestionWorkerFn: ingestionWorkerSub.nodes.function.name,
        ingestionCronFn: ingestionCron.nodes.function.name,
        discoveryDlqName: discoveryFeedDlq.nodes.queue.name,
        ingestionDlqName: ingestionDlq.nodes.queue.name,
        tableName: appTable.name,
      };
    }

    // Computed web domain and email sender for the Next.js app
    const webDomain = isDeployed
      ? `https://${isProd ? domainZone : `${stage}.${domainZone}`}`
      : "http://localhost:3000";

    const emailFromDomain = isDeployed
      ? isProd
        ? domainZone
        : `${stage}.${domainZone}`
      : "localhost";

    // Next.js web app
    const web = new sst.aws.Nextjs("Web", {
      path: "apps/web",
      environment: {
        APP_URL: webDomain,
        EMAIL_FROM: `Athlete Support <noreply@${emailFromDomain}>`,
      },
      domain: isDeployed
        ? {
            name: isProd ? domainZone : `${stage}.${domainZone}`,
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
        authTable,
        documentsBucket,
        discoveryFeedQueue,
        ...(ingestionQueue ? [ingestionQueue] : []),
      ],
    });

    // Web Lambda alarms + CloudWatch dashboard (needs web to be declared)
    if (isProd && alarmTopic && monitoringRefs) {
      // Web/Next.js server Lambda alarms
      new aws.cloudwatch.MetricAlarm("WebErrorsAlarm", {
        alarmDescription: "Web Lambda errors > 5 in 5 minutes",
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensions: { FunctionName: web.nodes.server.nodes.function.name },
        statistic: "Sum",
        period: 300,
        evaluationPeriods: 1,
        threshold: 5,
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      new aws.cloudwatch.MetricAlarm("WebDurationAlarm", {
        alarmDescription: "Web Lambda p99 duration > 30s",
        namespace: "AWS/Lambda",
        metricName: "Duration",
        dimensions: { FunctionName: web.nodes.server.nodes.function.name },
        extendedStatistic: "p99",
        period: 300,
        evaluationPeriods: 2,
        threshold: 30_000, // milliseconds
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alarmTopic.arn],
        okActions: [alarmTopic.arn],
      });

      // CloudWatch Dashboard (includes all lambdas + web)
      const dashboardBody = $resolve([
        monitoringRefs.slackFn,
        monitoringRefs.discoveryWorkerFn,
        monitoringRefs.discoveryCronFn,
        monitoringRefs.ingestionWorkerFn,
        monitoringRefs.ingestionCronFn,
        monitoringRefs.discoveryDlqName,
        monitoringRefs.ingestionDlqName,
        monitoringRefs.tableName,
        web.nodes.server.nodes.function.name,
      ]).apply(
        ([
          slackFn,
          discoveryWorkerFn,
          discoveryCronFn,
          ingestionWorkerFn,
          ingestionCronFn,
          discoveryDlqName,
          ingestionDlqName,
          tableName,
          webFn,
        ]) =>
          JSON.stringify({
            widgets: [
              // Row 1: Lambda Invocations + Lambda Errors
              {
                type: "metric",
                x: 0,
                y: 0,
                width: 12,
                height: 6,
                properties: {
                  title: "Lambda Invocations",
                  metrics: [
                    ["AWS/Lambda", "Invocations", "FunctionName", webFn],
                    ["...", slackFn],
                    ["...", discoveryWorkerFn],
                    ["...", discoveryCronFn],
                    ["...", ingestionWorkerFn],
                    ["...", ingestionCronFn],
                  ],
                  period: 300,
                  stat: "Sum",
                  region: "us-east-1",
                  view: "timeSeries",
                },
              },
              {
                type: "metric",
                x: 12,
                y: 0,
                width: 12,
                height: 6,
                properties: {
                  title: "Lambda Errors",
                  metrics: [
                    ["AWS/Lambda", "Errors", "FunctionName", webFn],
                    ["...", slackFn],
                    ["...", discoveryWorkerFn],
                    ["...", discoveryCronFn],
                    ["...", ingestionWorkerFn],
                    ["...", ingestionCronFn],
                  ],
                  period: 300,
                  stat: "Sum",
                  region: "us-east-1",
                  view: "timeSeries",
                },
              },
              // Row 2: Lambda Duration p99 + DLQ Depth
              {
                type: "metric",
                x: 0,
                y: 6,
                width: 12,
                height: 6,
                properties: {
                  title: "Lambda Duration p99",
                  metrics: [
                    ["AWS/Lambda", "Duration", "FunctionName", webFn],
                    ["...", slackFn],
                    ["...", discoveryWorkerFn],
                    ["...", discoveryCronFn],
                    ["...", ingestionWorkerFn],
                    ["...", ingestionCronFn],
                  ],
                  period: 300,
                  stat: "p99",
                  region: "us-east-1",
                  view: "timeSeries",
                },
              },
              {
                type: "metric",
                x: 12,
                y: 6,
                width: 12,
                height: 6,
                properties: {
                  title: "DLQ Message Depth",
                  metrics: [
                    [
                      "AWS/SQS",
                      "ApproximateNumberOfMessagesVisible",
                      "QueueName",
                      discoveryDlqName,
                    ],
                    ["...", ingestionDlqName],
                  ],
                  period: 300,
                  stat: "Sum",
                  region: "us-east-1",
                  view: "timeSeries",
                },
              },
              // Row 3: DynamoDB Capacity + Throttling
              {
                type: "metric",
                x: 0,
                y: 12,
                width: 12,
                height: 6,
                properties: {
                  title: "DynamoDB Read/Write Capacity",
                  metrics: [
                    [
                      "AWS/DynamoDB",
                      "ConsumedReadCapacityUnits",
                      "TableName",
                      tableName,
                    ],
                    [
                      "AWS/DynamoDB",
                      "ConsumedWriteCapacityUnits",
                      "TableName",
                      tableName,
                    ],
                  ],
                  period: 300,
                  stat: "Sum",
                  region: "us-east-1",
                  view: "timeSeries",
                },
              },
              {
                type: "metric",
                x: 12,
                y: 12,
                width: 12,
                height: 6,
                properties: {
                  title: "DynamoDB Throttled Requests",
                  metrics: [
                    [
                      "AWS/DynamoDB",
                      "ThrottledRequests",
                      "TableName",
                      tableName,
                    ],
                  ],
                  period: 300,
                  stat: "Sum",
                  region: "us-east-1",
                  view: "timeSeries",
                },
              },
            ],
          }),
      );

      new aws.cloudwatch.Dashboard("MonitoringDashboard", {
        dashboardName: "usopc-athlete-support-production",
        dashboardBody: dashboardBody,
      });
    }

    return {
      webUrl: web.url,
      slackUrl: slackApi.url,
      sourceConfigTableName: appTable.name,
      documentsBucketName: documentsBucket.name,
    };
  },
});
