import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/src/prisma/generated/client.js';

import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";

const log = logger.child("worker.lib.prisma");
const env = getWorkerEnv();

/**
 * Global reference used to preserve the Prisma client across hot-reloads in development.
 */
const globalForPrisma = global as unknown as {
    prisma: ReturnType<typeof createPrismaClient>
};

/**
 * Creates and configures a new Prisma client instance with the PostgreSQL adapter.
 *
 * When `PRISMA_LOG_QUERIES` is `"true"`, attaches an event listener that logs
 * slow queries (> 500 ms) as warnings.
 *
 * @returns A configured {@link PrismaClient} instance.
 */
function createPrismaClient() {
    const shouldLogQueries = env.PRISMA_LOG_QUERIES === 'true';
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    const prisma = new PrismaClient({
        adapter,
        log: shouldLogQueries ? [{ emit: 'event', level: 'query' }] : [],
    });

    if (shouldLogQueries) {
        prisma.$on('query', (e) => {
            if (e.duration <= 500) {
                return;
            }

            log.warn(`Slow Prisma query detected: ${e.query} (${e.duration}ms)`, {
                'prisma.query': e.query,
                'prisma.duration': e.duration,
            });
        });
    }

    return prisma;
}

/**
 * Singleton Prisma client for the worker package.
 *
 * In non-production environments, the instance is cached on `globalThis`
 * to survive module reloads during development.
 *
 * **Usage:** `import prisma from "@/src/lib/prisma.js";`
 */
const prisma = globalForPrisma.prisma || createPrismaClient();

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;