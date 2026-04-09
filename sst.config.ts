/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "usopc-athlete-support",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
          ...(process.env.CI ? {} : { profile: "default" }),
        },
      },
    };
  },
  async run() {
    const stage = $app.stage;
    const isProd = stage === "production";

    // AWS AppRegistry — groups all resources under myApplications in the console
    const appRegistry = new aws.servicecatalog.AppregistryApplication(
      "AppRegistry",
      {
        name: `usopc-athlete-support-${stage}`,
        description: `USOPC Athlete Support Agent (${stage})`,
      },
    );
    const appTag = appRegistry.applicationTag;

    /** Merge the AppRegistry applicationTag into a resource's tags. */
    function withAppTag(existingTags: unknown) {
      return $resolve([existingTags ?? {}, appTag]).apply(
        ([existing, tag]) => ({
          ...(existing as Record<string, string>),
          ...(tag as Record<string, string>),
        }),
      );
    }

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
    // Voyage AI (embedding benchmark)
    const voyageaiKey = new sst.Secret("VoyageaiApiKey");
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

    const linkables = [
      anthropicKey,
      openaiKey,
      googleKey,
      tavilyKey,
      langchainKey,
      voyageaiKey,
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
          args.tags = withAppTag(args.tags);
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
      transform: {
        table: (args) => {
          args.tags = withAppTag(args.tags);
        },
      },
    });

    // S3 bucket for document storage (cache/archive)
    const documentsBucket = new sst.aws.Bucket("DocumentsBucket", {
      versioning: true,
      transform: {
        bucket: (args) => {
          args.tags = withAppTag(args.tags);
        },
      },
    });

    // Custom domains — only for deployed stages (staging, production).
    // Local dev stages use raw AWS URLs (no domain config needed).
    const isDeployed = isProd || stage === "staging";
    const domainZone = "athlete-agent.rosinbum.org";

    // Slack bot — Lambda + API Gateway for local dev only.
    // Deployed stages (staging, production) run on EC2 with PM2.
    let slackApiUrl: string | undefined;

    if (!isDeployed) {
      const slackApi = new sst.aws.ApiGatewayV2("SlackApi", {});
      slackApi.route("$default", {
        handler: "apps/slack/src/index.handler",
        link: [...linkables, slackBotToken, slackSigningSecret, appTable],
        timeout: "120 seconds",
        memory: "512 MB",
      });
      slackApiUrl = slackApi.url;
    }

    // Discovery feed queue — processes discovered URLs through the evaluation
    // pipeline asynchronously (metadata eval → content extraction → content eval).
    // Available in all stages so both the agent (Web) and discovery cron can publish.
    const discoveryFeedDlq = new sst.aws.Queue("DiscoveryFeedDLQ", {
      transform: {
        queue: (args) => {
          args.tags = withAppTag(args.tags);
        },
      },
    });
    const discoveryFeedQueue = new sst.aws.Queue("DiscoveryFeedQueue", {
      visibilityTimeout: "10 minutes",
      dlq: {
        queue: discoveryFeedDlq.arn,
        retry: 2,
      },
      transform: {
        queue: (args) => {
          args.tags = withAppTag(args.tags);
        },
      },
    });

    // Polyfill browser globals that pdfjs-dist (via pdf-parse) expects at
    // module load time. @napi-rs/canvas can't load on Lambda, so we stub the
    // minimum surface area needed for text extraction (no rendering).
    const pdfjsPolyfillBanner = [
      `if(typeof globalThis.DOMMatrix==="undefined"){`,
      `globalThis.DOMMatrix=class DOMMatrix{`,
      `constructor(){this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0}`,
      `multiplySelf(){return this}preMultiplySelf(){return this}`,
      `translate(){return this}scale(){return this}invertSelf(){return this}`,
      `static fromMatrix(){return new DOMMatrix()}};`,
      `globalThis.Path2D=class Path2D{addPath(){}};`,
      `globalThis.ImageData=class ImageData{`,
      `constructor(w,h){this.width=w;this.height=h;this.data=new Uint8ClampedArray(w*h*4)}}}`,
    ].join("");

    // Shared nodejs config for Lambdas that bundle pdf-parse / pdfjs-dist.
    // - banner: stubs DOMMatrix/Path2D/ImageData before module load
    // - install: moves pdfjs-dist to node_modules/ so pdf.worker.mjs is on disk
    // - external: prevents bundling the native @napi-rs/canvas module
    const pdfjsNodejsConfig = {
      banner: pdfjsPolyfillBanner,
      install: ["pdfjs-dist"],
      esbuild: { external: ["@napi-rs/canvas"] },
    };

    // Ingestion queue — created before DiscoveryFeedWorker so it can be linked
    // conditionally. Worker subscriber + crons are production-only (below).
    let ingestionQueue: sst.aws.Queue | undefined;
    let ingestionDlq: sst.aws.Queue | undefined;
    let alarmTopic: aws.sns.Topic | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let monitoringRefs: Record<string, any> | undefined;

    if (isDeployed) {
      // Dead-letter queue (must also be FIFO to match main queue)
      ingestionDlq = new sst.aws.Queue("IngestionDLQ", {
        fifo: true,
        transform: {
          queue: (args) => {
            args.tags = withAppTag(args.tags);
          },
        },
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
        transform: {
          queue: (args) => {
            args.tags = withAppTag(args.tags);
          },
        },
      });
    }

    const discoveryFeedWorkerSub = discoveryFeedQueue.subscribe(
      {
        handler: "packages/ingestion/src/discoveryFeedWorker.handler",
        link: [
          ...linkables,
          appTable,
          ...(ingestionQueue ? [ingestionQueue] : []),
        ],
        timeout: "10 minutes",
        memory: "512 MB",
      },
      {
        batch: { size: 1 },
      },
    );

    // Source discovery, document ingestion, monitoring — deployed stages only

    if (isDeployed) {
      // Worker: processes one source per SQS message (needed for manual triggers from admin)
      const ingestionWorkerSub = ingestionQueue!.subscribe(
        {
          handler: "packages/ingestion/src/worker.handler",
          link: [...linkables, appTable, documentsBucket],
          timeout: "15 minutes",
          memory: "1024 MB",
          nodejs: pdfjsNodejsConfig,
        },
        {
          batch: { size: 1 },
        },
      );

      // Crons: production only — staging uses manual triggers from admin console
      let discoveryCron: sst.aws.Cron | undefined;
      let ingestionCron: sst.aws.Cron | undefined;

      if (isProd) {
        discoveryCron = new sst.aws.Cron("DiscoveryCron", {
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
              TAVILY_MONTHLY_BUDGET:
                process.env.TAVILY_MONTHLY_BUDGET ?? "1000",
              ANTHROPIC_MONTHLY_BUDGET:
                process.env.ANTHROPIC_MONTHLY_BUDGET ?? "10",
              SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL ?? "",
              NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL ?? "",
              SES_FROM_EMAIL: process.env.SES_FROM_EMAIL ?? "noreply@usopc.org",
            },
            copyFiles: [{ from: "data/discovery-config.json" }],
          },
        });

        // Coordinator: cron checks for changes, enqueues to SQS
        ingestionCron = new sst.aws.Cron("IngestionCron", {
          schedule: "rate(7 days)",
          job: {
            handler: "packages/ingestion/src/cron.handler",
            link: [...linkables, ingestionQueue, appTable, documentsBucket],
            timeout: "5 minutes",
            memory: "512 MB",
            nodejs: pdfjsNodejsConfig,
          },
        });

        // Checkpoint cleanup — prunes old LangGraph checkpoint rows daily
        const checkpointCleanupCron = new sst.aws.Cron(
          "CheckpointCleanupCron",
          {
            schedule: "rate(1 day)",
            job: {
              handler: "packages/core/src/functions/checkpointCleanup.handler",
              link: [databaseUrlSecret],
              timeout: "2 minutes",
              memory: "256 MB",
            },
          },
        );
      }

      // --- Monitoring (production only — cron alarms + dashboard reference cron Lambdas) ---

      if (isProd) {
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

        // Web and Slack run on EC2 — no Lambda alarms for those.

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
          dimensions: { FunctionName: discoveryCron!.nodes.function.name },
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
          dimensions: { FunctionName: ingestionCron!.nodes.function.name },
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
          dimensions: { QueueName: ingestionDlq!.nodes.queue.name },
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

        // Save references for dashboard (workers + crons only — web/slack run on EC2)
        monitoringRefs = {
          discoveryWorkerFn: discoveryFeedWorkerSub.nodes.function.name,
          discoveryCronFn: discoveryCron!.nodes.function.name,
          ingestionWorkerFn: ingestionWorkerSub.nodes.function.name,
          ingestionCronFn: ingestionCron!.nodes.function.name,
          discoveryDlqName: discoveryFeedDlq.nodes.queue.name,
          ingestionDlqName: ingestionDlq!.nodes.queue.name,
          tableName: appTable.name,
        };
      } // end if (isProd) monitoring
    }

    // --- EC2 Instance for Web + Slack (deployed stages only) ---

    let ec2PublicIp: string | undefined;

    if (isDeployed) {
      // SSH key pair — set with: sst secret set Ec2SshPublicKey "ssh-rsa ..." --stage production
      const ec2SshPublicKey = new sst.Secret("Ec2SshPublicKey");

      const keyPair = new aws.ec2.KeyPair("AppKeyPair", {
        keyName: `usopc-athlete-support-${stage}`,
        publicKey: ec2SshPublicKey.value,
        tags: withAppTag({ Name: `usopc-athlete-support-${stage}` }),
      });

      // Security group — HTTP, HTTPS, SSH inbound; all outbound
      const defaultVpc = aws.ec2.getVpcOutput({ default: true });

      const sg = new aws.ec2.SecurityGroup("AppSg", {
        vpcId: defaultVpc.id,
        description: `USOPC Athlete Support EC2 (${stage})`,
        ingress: [
          {
            protocol: "tcp",
            fromPort: 22,
            toPort: 22,
            cidrBlocks: ["0.0.0.0/0"],
            description: "SSH",
          },
          {
            protocol: "tcp",
            fromPort: 80,
            toPort: 80,
            cidrBlocks: ["0.0.0.0/0"],
            description: "HTTP",
          },
          {
            protocol: "tcp",
            fromPort: 443,
            toPort: 443,
            cidrBlocks: ["0.0.0.0/0"],
            description: "HTTPS",
          },
        ],
        egress: [
          {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
            description: "All outbound",
          },
        ],
        tags: withAppTag({ Name: `usopc-athlete-support-${stage}` }),
      });

      // IAM role — grants EC2 access to DynamoDB, SQS, S3, SSM, CloudWatch
      const ec2Role = new aws.iam.Role("AppEc2Role", {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ec2.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
        tags: withAppTag({ Name: `usopc-athlete-support-${stage}` }),
      });

      // Scoped policy for our specific resources
      const policyDoc = $resolve([
        appTable.nodes.table.arn,
        authTable.nodes.table.arn,
        documentsBucket.nodes.bucket.arn,
        discoveryFeedQueue.nodes.queue.arn,
        discoveryFeedDlq.nodes.queue.arn,
        ...(ingestionQueue ? [ingestionQueue.nodes.queue.arn] : []),
        ...(ingestionDlq ? [ingestionDlq.nodes.queue.arn] : []),
      ]).apply((arns) => {
        const [appArn, authArn, bucketArn, ...queueArns] = arns;
        return JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:BatchGetItem",
                "dynamodb:BatchWriteItem",
              ],
              Resource: [
                appArn,
                `${appArn}/index/*`,
                authArn,
                `${authArn}/index/*`,
              ],
            },
            {
              Effect: "Allow",
              Action: [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
              ],
              Resource: [bucketArn, `${bucketArn}/*`],
            },
            {
              Effect: "Allow",
              Action: [
                "sqs:SendMessage",
                "sqs:ReceiveMessage",
                "sqs:DeleteMessage",
                "sqs:GetQueueAttributes",
              ],
              Resource: queueArns,
            },
          ],
        });
      });

      new aws.iam.RolePolicy("AppEc2ResourcePolicy", {
        role: ec2Role.name,
        policy: policyDoc,
      });

      // SSM access (for `sst shell` to resolve secrets on the instance)
      new aws.iam.RolePolicyAttachment("AppEc2Ssm", {
        role: ec2Role.name,
        policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
      });

      // CloudWatch Agent (for instance metrics)
      new aws.iam.RolePolicyAttachment("AppEc2Cw", {
        role: ec2Role.name,
        policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
      });

      const instanceProfile = new aws.iam.InstanceProfile("AppEc2Profile", {
        role: ec2Role.name,
      });

      // Latest Amazon Linux 2023 AMI
      const ami = aws.ec2.getAmiOutput({
        mostRecent: true,
        owners: ["amazon"],
        filters: [
          { name: "name", values: ["al2023-ami-2023.*-x86_64"] },
          { name: "state", values: ["available"] },
        ],
      });

      // Bootstrap script — installs system deps on first boot
      const userData = [
        "#!/bin/bash",
        "set -e",
        "dnf install -y nodejs20 nginx git",
        "alternatives --install /usr/bin/node node /usr/bin/node-20 20",
        "alternatives --install /usr/bin/npm npm /usr/bin/npm-20 20",
        "alternatives --install /usr/bin/npx npx /usr/bin/npx-20 20",
        // Install pnpm as ec2-user using global-prefix install so the binary
        // lands in ~/.local/bin (accessible to ec2-user at deploy time)
        "runuser -l ec2-user -c 'mkdir -p ~/.local && npm install -g --prefix ~/.local pnpm@9'",
        "npm install -g pm2",
        "mkdir -p /home/ec2-user/app",
        "chown ec2-user:ec2-user /home/ec2-user/app",
        // Create a 2GB swap file — Next.js build exceeds 2GB RSS on t3.small
        "dd if=/dev/zero of=/swapfile bs=1M count=2048",
        "chmod 600 /swapfile",
        "mkswap /swapfile",
        "swapon /swapfile",
        "echo '/swapfile none swap sw 0 0' >> /etc/fstab",
        "systemctl enable nginx",
        "systemctl start nginx",
        "env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user",
      ].join("\n");

      const instance = new aws.ec2.Instance("AppInstance", {
        instanceType: "t3.small",
        ami: ami.id,
        keyName: keyPair.keyName,
        vpcSecurityGroupIds: [sg.id],
        iamInstanceProfile: instanceProfile.name,
        userData,
        rootBlockDevice: {
          volumeSize: 20,
          volumeType: "gp3",
        },
        tags: withAppTag({ Name: `usopc-athlete-support-${stage}` }),
      });

      // Elastic IP
      const eip = new aws.ec2.Eip("AppEip", {
        instance: instance.id,
        tags: withAppTag({ Name: `usopc-athlete-support-${stage}` }),
      });

      ec2PublicIp = eip.publicIp;

      // Route 53 DNS records pointing to the EIP
      const zone = aws.route53.getZoneOutput({
        name: "athlete-agent.rosinbum.org",
      });

      new aws.route53.Record("WebDnsRecord", {
        zoneId: zone.zoneId,
        name: isProd ? domainZone : `${stage}.${domainZone}`,
        type: "A",
        ttl: 300,
        records: [eip.publicIp],
      });

      new aws.route53.Record("SlackDnsRecord", {
        zoneId: zone.zoneId,
        name: isProd ? `slack.${domainZone}` : `slack-${stage}.${domainZone}`,
        type: "A",
        ttl: 300,
        records: [eip.publicIp],
      });
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

    // Next.js web app — Lambda + CloudFront for local dev only.
    // Deployed stages (staging, production) run on EC2 with PM2.
    let webUrl: string | undefined;

    if (!isDeployed) {
      const web = new sst.aws.Nextjs("Web", {
        path: "apps/web",
        server: {
          timeout: "60 seconds",
          memory: "1024 MB",
        },
        environment: {
          APP_URL: webDomain,
          EMAIL_FROM: `Athlete Support <noreply@${emailFromDomain}>`,
        },
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
          discoveryFeedDlq,
          ...(ingestionQueue ? [ingestionQueue] : []),
          ...(ingestionDlq ? [ingestionDlq] : []),
        ],
      });
      webUrl = web.url;
    }

    // CloudWatch Dashboard — workers, crons, DLQs, DynamoDB only.
    // Web and Slack run on EC2 (monitor via CloudWatch Agent + Route 53 health checks).
    if (isDeployed && alarmTopic && monitoringRefs) {
      const dashboardBody = $resolve([
        monitoringRefs.discoveryWorkerFn,
        monitoringRefs.discoveryCronFn,
        monitoringRefs.ingestionWorkerFn,
        monitoringRefs.ingestionCronFn,
        monitoringRefs.discoveryDlqName,
        monitoringRefs.ingestionDlqName,
        monitoringRefs.tableName,
      ]).apply(
        ([
          discoveryWorkerFn,
          discoveryCronFn,
          ingestionWorkerFn,
          ingestionCronFn,
          discoveryDlqName,
          ingestionDlqName,
          tableName,
        ]) =>
          JSON.stringify({
            widgets: [
              // Row 1: Lambda Invocations + Lambda Errors (workers + crons only)
              {
                type: "metric",
                x: 0,
                y: 0,
                width: 12,
                height: 6,
                properties: {
                  title: "Lambda Invocations",
                  metrics: [
                    [
                      "AWS/Lambda",
                      "Invocations",
                      "FunctionName",
                      discoveryWorkerFn,
                    ],
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
                    ["AWS/Lambda", "Errors", "FunctionName", discoveryWorkerFn],
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
                    [
                      "AWS/Lambda",
                      "Duration",
                      "FunctionName",
                      discoveryWorkerFn,
                    ],
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
        dashboardName: `usopc-athlete-support-${stage}`,
        dashboardBody: dashboardBody,
      });
    }

    return {
      webUrl: webUrl ?? webDomain,
      slackUrl:
        slackApiUrl ??
        `https://${isProd ? `slack.${domainZone}` : `slack-${stage}.${domainZone}`}`,
      sourceConfigTableName: appTable.name,
      documentsBucketName: documentsBucket.name,
      ...(ec2PublicIp ? { ec2PublicIp } : {}),
    };
  },
});
