FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/package.json
COPY packages/worker/package.json ./packages/worker/package.json
RUN npm i --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY . .

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

RUN npm run prisma:generate --workspace=packages/web
RUN npm run build --workspace=packages/web

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/packages/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/prisma ./packages/web/prisma
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/prisma.config.ts ./packages/web/prisma.config.ts

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]