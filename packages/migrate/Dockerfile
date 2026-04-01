FROM node:22-alpine

WORKDIR /app

COPY packages/migrate/package.json ./package.json
RUN npm install --no-audit --no-fund --omit=dev

COPY packages/web/prisma ./packages/web/prisma
# Keep the script at packages/migrate/ so the repo-root path calculation (../.. from script) resolves correctly
COPY packages/migrate/run-sql-migrations.mjs ./packages/migrate/run-sql-migrations.mjs

CMD ["node", "packages/migrate/run-sql-migrations.mjs"]
