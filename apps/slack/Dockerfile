# ---------- Stage 1: Install dependencies ----------
FROM node:20-slim AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/slack/package.json apps/slack/
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# ---------- Stage 2: Build ----------
FROM node:20-slim AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/slack/node_modules ./apps/slack/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY . .

RUN pnpm --filter @usopc/shared build && \
    pnpm --filter @usopc/core build && \
    pnpm --filter @usopc/slack build

# ---------- Stage 3: Production ----------
FROM node:20-slim AS production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/apps/slack/dist ./apps/slack/dist
COPY --from=build /app/apps/slack/package.json ./apps/slack/
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/

COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/package.json ./

RUN pnpm install --frozen-lockfile --prod

EXPOSE 8080

CMD ["node", "apps/slack/dist/server.js"]
