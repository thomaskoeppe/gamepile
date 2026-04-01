import { PrismaPg } from '@prisma/adapter-pg';

import { logger } from "@/lib/logger";
import { PrismaClient } from '@/prisma/generated/client';

const log = logger.child("server.services.prisma");

const globalForPrisma = global as unknown as {
    prisma: ReturnType<typeof createPrismaClient>
};

function createPrismaClient() {
    const shouldLogQueries = (process.env.PRISMA_LOG_QUERIES ?? "true") === "true";
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
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

globalForPrisma.prisma = prisma;

export default prisma;