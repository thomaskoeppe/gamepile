FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/
COPY packages/worker/package.json ./packages/worker/
# shared is a local workspace package; its package.json must be present so
# npm creates the node_modules/@gamepile/shared symlink during `npm ci`.
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/
COPY packages/worker/package.json ./packages/worker/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --omit=dev --workspace=packages/worker

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

RUN npm run prisma:generate --workspace=packages/worker
RUN npm run build --workspace=packages/worker

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 worker
RUN adduser --system --uid 1001 worker

COPY --from=prod-deps --chown=worker:worker /app/node_modules ./node_modules

COPY --from=builder --chown=worker:worker /app/packages/worker/dist ./packages/worker/dist
COPY --from=builder --chown=worker:worker /app/packages/worker/src/prisma ./packages/worker/src/prisma
COPY --from=builder --chown=worker:worker /app/packages/worker/package.json ./packages/worker/package.json
COPY --from=builder --chown=worker:worker /app/packages/worker/prisma.config.ts ./packages/worker/prisma.config.ts
COPY --from=builder --chown=worker:worker /app/prisma ./prisma

USER worker

CMD ["node", "packages/worker/dist/index.js"]
