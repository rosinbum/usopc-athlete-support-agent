# syntax=docker/dockerfile:1.7
#
# Unified monorepo image. A single image runs `web`, `slack`, or `worker`
# depending on the `command`/`args` Cloud Run passes at startup.
#
# Why one image: projected traffic is low, and maintaining three near-identical
# Dockerfiles triples CI time and the blast radius for base-image changes.
# Differentiation happens at runtime via Pulumi container args.

# ---------- Stage 1: Install workspace dependencies ----------
FROM node:20-slim AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Patches must exist before `pnpm install` — the root package.json references
# patches/@langchain__community.patch via pnpm.patchedDependencies.
COPY patches patches

# Workspace manifests + lockfile (kept separate from source for cache hits).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/slack/package.json apps/slack/
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
COPY packages/ingestion/package.json packages/ingestion/
COPY packages/evals/package.json packages/evals/

RUN pnpm install --frozen-lockfile

# ---------- Stage 2: Build all services ----------
FROM node:20-slim AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/slack/node_modules ./apps/slack/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/ingestion/node_modules ./packages/ingestion/node_modules

COPY . .

# Build in dependency order: shared → core → leaf packages.
RUN pnpm --filter @usopc/shared build \
 && pnpm --filter @usopc/core build \
 && pnpm --filter @usopc/ingestion build \
 && pnpm --filter @usopc/slack build \
 && pnpm --filter @usopc/web build

# ---------- Stage 3: Production runtime ----------
FROM node:20-slim AS production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# tsx is needed at runtime: workspace packages (`@usopc/shared`, `@usopc/core`)
# keep `main` pointing at `src/index.ts` so local dev doesn't require a prior
# build. Installing tsx globally lets every service (`tsx <entry>`) resolve
# `.ts` imports without changing the dev workflow.
RUN npm install -g tsx@4.19.2

ENV NODE_ENV=production
ENV PORT=8080

# Web — React Router SSR bundle + full source tree. tsx runs
# apps/web/server/app.ts which imports from app/, components/, hooks/, lib/,
# etc. — all ESM `.ts` resolved at runtime, so we ship the whole package.
COPY --from=build /app/apps/web/build ./apps/web/build
COPY --from=build /app/apps/web/server ./apps/web/server
COPY --from=build /app/apps/web/app ./apps/web/app
COPY --from=build /app/apps/web/components ./apps/web/components
COPY --from=build /app/apps/web/hooks ./apps/web/hooks
COPY --from=build /app/apps/web/lib ./apps/web/lib
COPY --from=build /app/apps/web/types ./apps/web/types
COPY --from=build /app/apps/web/react-router.config.ts ./apps/web/
COPY --from=build /app/apps/web/vite.config.ts ./apps/web/
COPY --from=build /app/apps/web/tsconfig.json ./apps/web/
COPY --from=build /app/apps/web/package.json ./apps/web/

# Slack — compiled .js but imports @usopc/shared/core whose `main` points at
# `.ts`, so tsx handles runtime resolution.
COPY --from=build /app/apps/slack/dist ./apps/slack/dist
COPY --from=build /app/apps/slack/package.json ./apps/slack/

# Worker (ingestion)
COPY --from=build /app/packages/ingestion/dist ./packages/ingestion/dist
COPY --from=build /app/packages/ingestion/package.json ./packages/ingestion/

# Shared libs consumed by all three services. We copy `src/` because the
# packages' `main` fields still point at `./src/index.ts` (see packages/
# shared/package.json, packages/core/package.json) — tsx resolves those at
# runtime. If we ever flip `main` to `./dist/index.js`, these can drop.
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/src ./packages/core/src
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/src ./packages/shared/src
COPY --from=build /app/packages/shared/package.json ./packages/shared/

# Seed / reference data used by workers and discovery
COPY --from=build /app/data ./data

# Patches again — pnpm re-reads them during the --prod install
COPY --from=build /app/patches ./patches

# Workspace metadata
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/package.json ./

# Production dependencies only
RUN pnpm install --frozen-lockfile --prod

EXPOSE 8080

# Default to the web service. Pulumi overrides this per Cloud Run service
# (see infra/gcp/index.ts) to select slack or worker without rebuilding.
CMD ["tsx", "apps/web/server/app.ts"]
