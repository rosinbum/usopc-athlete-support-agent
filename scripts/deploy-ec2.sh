#!/usr/bin/env bash
# deploy-ec2.sh — Deploy web app and Slack bot on EC2.
# Run directly on the EC2 instance, or via SSH from CI.
#
# Usage:
#   ./scripts/deploy-ec2.sh                       # deploy latest main to production
#   ./scripts/deploy-ec2.sh v1.2.3                # deploy a specific tag to production
#   ./scripts/deploy-ec2.sh v1.2.3 staging        # deploy a tag to a specific stage
set -euo pipefail

TAG="${1:-}"
STAGE="${2:-production}"
REPO_URL="${REPO_URL:-git@github.com:rosinbum/usopc-athlete-support-agent.git}"
APP_DIR="${APP_DIR:-/home/ec2-user/app}"

# Ensure pnpm is available. corepack runs as root in userData so its cache
# is inaccessible to ec2-user. Use --global --prefix to a user-writable
# directory so npm creates the binary in <prefix>/bin/ without needing sudo.
# Hardcode path — $HOME may not be set in non-login SSH sessions.
export PATH="/home/ec2-user/.local/bin:$PATH"
if ! command -v pnpm &>/dev/null; then
  echo "==> Installing pnpm to /home/ec2-user/.local (user-global)"
  sudo rm -rf /usr/lib/nodejs20/lib/node_modules/pnpm 2>/dev/null || true
  mkdir -p /home/ec2-user/.local
  npm install -g --prefix /home/ec2-user/.local pnpm@9
fi

# Clone on first deploy, otherwise just fetch
if [ ! -d "$APP_DIR/.git" ]; then
  echo "==> First deploy — cloning repo"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

echo "==> Fetching latest code"
git fetch origin

if [ -n "$TAG" ]; then
  echo "==> Checking out tag $TAG"
  git checkout "refs/tags/$TAG"
else
  echo "==> Pulling latest main"
  git checkout main
  git pull origin main
fi

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Building web app"
pnpm --filter @usopc/web build

echo "==> Copying static assets to standalone directory"
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
cp -r apps/web/public apps/web/.next/standalone/apps/web/public 2>/dev/null || true

echo "==> Building Slack bot"
pnpm --filter @usopc/slack build

echo "==> Syncing SST environment bindings (stage: $STAGE)"
"$APP_DIR/scripts/sync-sst-env.sh" "$STAGE"
# shellcheck source=/dev/null
set -a; source "$APP_DIR/.env.ec2"; set +a

echo "==> Restarting PM2 processes"
pm2 restart ecosystem.config.cjs --update-env 2>/dev/null || pm2 start ecosystem.config.cjs

echo "==> Waiting for processes to start"
sleep 3

echo "==> Health checks"
FAILED=0

if curl -sf http://localhost:3000/api/health > /dev/null; then
  echo "  Web app: OK"
else
  echo "  Web app: FAILED"
  FAILED=1
fi

if curl -sf http://localhost:3001/health > /dev/null; then
  echo "  Slack bot: OK"
else
  echo "  Slack bot: FAILED"
  FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  echo "==> Health checks failed — check pm2 logs"
  pm2 logs --lines 20 --nostream
  exit 1
fi

echo "==> Deploy complete"
