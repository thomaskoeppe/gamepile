import { defineConfig, env } from "prisma/config";

/**
 * Prisma configuration for the worker package.
 *
 * Points to the shared schema at the monorepo root and uses the web package's
 * migration directory. The database URL is read from the `DATABASE_URL` environment variable.
 */
export default defineConfig({
  schema: "../../prisma/schema.prisma",
  migrations: {
    path: "../web/prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
