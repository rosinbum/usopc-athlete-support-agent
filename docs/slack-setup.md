# Slack App Setup Guide

This guide walks through creating and configuring the Athlete Support Slack App at api.slack.com, connecting it to the deployed Lambda, and verifying end-to-end functionality.

## Prerequisites

- AWS credentials configured locally
- SST CLI installed (`npm install -g sst`)
- Access to a Slack workspace with permission to create apps
- The repo cloned and `pnpm install` run

---

## Step 1: Initial Deploy (Placeholder Secrets)

SST requires secrets to exist before deploying, even if the values aren't real yet. Set placeholder values, then deploy to get the Lambda URL.

```bash
sst secret set SlackBotToken placeholder
sst secret set SlackSigningSecret placeholder
sst deploy --stage staging
```

Note the `slackUrl` output from SST — it looks like:

```
slackUrl: https://abc123.execute-api.us-east-1.amazonaws.com
```

---

## Step 2: Create the Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App → From Manifest**
3. Select your workspace and click **Next**
4. Open `apps/slack/slack-app-manifest.yml` from this repo
5. Replace both occurrences of `REPLACE_WITH_SLACK_URL` with the actual `slackUrl` from Step 1
6. Paste the updated manifest into the text area and click **Next**
7. Review the summary (scopes, events, slash command) and click **Create**

---

## Step 3: Install the App and Get Credentials

### Install to Workspace

1. In the app dashboard, click **Install App** in the left sidebar
2. Click **Install to Workspace** and authorize the requested permissions
3. Copy the **Bot User OAuth Token** (starts with `xoxb-…`)

### Get the Signing Secret

1. Click **Basic Information** in the left sidebar
2. Under **App Credentials**, find **Signing Secret**
3. Click **Show** and copy the value

---

## Step 4: Set Real Secrets

```bash
sst secret set SlackBotToken xoxb-...
sst secret set SlackSigningSecret <signing-secret>
```

---

## Step 5: Redeploy with Real Secrets

```bash
sst deploy --stage staging
```

This picks up the real credentials and makes the Lambda functional.

---

## Step 6: Verify URL Verification

In the Slack App dashboard:

1. Go to **Event Subscriptions** in the left sidebar
2. The **Request URL** should show a green **✅ Verified** badge

If it shows an error:

- Confirm the URL in the manifest matches the SST `slackUrl` output exactly (no trailing slash)
- Check CloudWatch logs for the `SlackApi` Lambda for error details
- Run a health check: `curl https://{slackUrl}/health` → should return `{"status":"ok"}`

---

## Step 7: Test the Bot

### DM the bot

Send a direct message to **Athlete Support**:

```
What are the team selection criteria for track cycling?
```

The bot should:

1. React with 👀 (eyes emoji) to acknowledge
2. Post a formatted answer with citations and feedback buttons

### @mention in a channel

Invite the bot to a channel, then mention it:

```
@Athlete Support What are the anti-doping testing obligations?
```

The bot should respond in a thread.

### Slash command

In any channel:

```
/ask-athlete-support What is the athlete ombudsman process?
```

The bot posts an ephemeral "thinking" message, then the full answer.

---

## Production Deployment

Repeat Steps 4–7 for the production stage:

```bash
sst secret set SlackBotToken xoxb-... --stage production
sst secret set SlackSigningSecret <signing-secret> --stage production
sst deploy --stage production
```

The production `slackUrl` will be different from staging. Update the Event Subscriptions and Interactivity URLs in the Slack App dashboard to point to the production URL, or create a separate Slack App for production.

If you update `apps/slack/slack-app-manifest.yml` with the real URL, also update the manifest in the Slack App dashboard (**App Manifest** tab) to keep them in sync.

---

## Local Development

### Running the dev server

The dev server (`src/dev.ts`) calls `getAppRunner()`, `postMessage`, and `addReaction`, which all require secrets. Run with `sst shell` to inject them:

```bash
sst shell -- pnpm --filter @usopc/slack dev
```

### Receiving real Slack events with ngrok

The dev server runs on `localhost:3002`. Slack requires a public HTTPS URL for event delivery. Use ngrok to create a tunnel:

```bash
ngrok http 3002
```

Use the generated URL (e.g. `https://abc123.ngrok.io`) as the temporary **Request URL** in the Slack App dashboard under **Event Subscriptions** and **Interactivity & Shortcuts**.

> **Note:** The ngrok URL changes on every restart. Update the Slack dashboard each time, or use a paid ngrok static domain to keep it stable.

---

## Troubleshooting

### Signature verification failures (401 responses)

The Lambda checks `X-Slack-Signature` on every request. Failures mean:

- `SlackSigningSecret` is wrong — double-check the value in the Slack dashboard (**Basic Information → Signing Secret**)
- The secret wasn't picked up — redeploy after setting the secret

### Bot not responding to DMs

- Confirm `message.im` is listed under **Event Subscriptions → Subscribe to bot events**
- Confirm `im:read`, `im:history`, and `im:write` scopes are granted (reinstall the app if scopes changed)

### Circuit breaker open

If the agent is erroring repeatedly, the circuit breaker trips and the bot responds with a fallback message. Check CloudWatch logs for the root cause. The circuit breaker resets automatically after the cooldown period.

### CloudWatch logs

Lambda logs are in the `SlackApi` log group. Filter by `ERROR` to find failures:

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/SlackApi-staging \
  --filter-pattern ERROR \
  --start-time $(date -v-1H +%s000)
```
