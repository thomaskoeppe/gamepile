import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/src/prisma/generated/client.js';

import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";

const log = logger.child("server.services.prisma");
const env = getWorkerEnv();

const globalForPrisma = global as unknown as {
    prisma: ReturnType<typeof createPrismaClient>
};

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

const prisma = globalForPrisma.prisma || createPrismaClient();

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;