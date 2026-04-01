import { JobType, JobStatus } from "@/src/prisma/generated/enums.js";

import { createLog } from "@/src/lib/job/log.js";
import { jobsQueue } from "@/src/lib/job/queue.js";
import { logger } from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";

const BATCH_SIZE = 100;

export async function runInternalScheduledTask(payload: {
    jobId: string;
    importUserLibraryIntervalMs: number;
}) {
    const { jobId, importUserLibraryIntervalMs } = payload;
    const log = logger.child("worker.jobs:internalScheduledTask", { jobId });

    const cutoffDate = new Date(Date.now() - importUserLibraryIntervalMs);

    const [recentlyImported, alreadyPending] = await Promise.all([
        prisma.job.findMany({
            where: {
                type: JobType.IMPORT_USER_LIBRARY,
                status: { in: [JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED] },
                finishedAt: { gte: cutoffDate },
                userId: { not: null },
            },
            select: { userId: true },
            distinct: ["userId"],
        }),
        prisma.job.findMany({
            where: {
                type: JobType.IMPORT_USER_LIBRARY,
                status: { in: [JobStatus.QUEUED, JobStatus.ACTIVE] },
                userId: { not: null },
            },
            select: { userId: true },
            distinct: ["userId"],
        }),
    ]);

    const skipUserIds = new Set([...recentlyImported.map((job) => job.userId!), ...alreadyPending.map((job) => job.userId!)]);

    const usersToImport = await prisma.user.findMany({
        where: { id: { notIn: [...skipUserIds] } },
        select: { id: true },
    });

    for (const user of usersToImport) {
        const dbJob = await prisma.job.create({
            data: { type: JobType.IMPORT_USER_LIBRARY, userId: user.id },
        });

        log.info("Scheduling recurring library import for user", {
            userId: user.id,
            scheduledJobId: dbJob.id,
        });

        await jobsQueue.add(JobType.IMPORT_USER_LIBRARY, {
            jobId: dbJob.id,
            type: JobType.IMPORT_USER_LIBRARY,
            userId: user.id,
        });

        await createLog(dbJob.id, "info", "Scheduled recurring library import for user");
    }

    const unmatchedKeys = await prisma.keyVaultGame.findMany({
        where: { gameId: null },
        select: { id: true, originalName: true },
    });

    if (!unmatchedKeys.length) {
        log.info("No unmatched game keys to resolve");
        return;
    }

    const uniqueNames = [...new Set(unmatchedKeys.map((key) => key.originalName))];

    const matchingGames = await prisma.game.findMany({
        where: { name: { in: uniqueNames } },
        select: { id: true, name: true },
    });

    if (!matchingGames.length) {
        log.info("No matching games found for unmatched keys");
        return;
    }

    const nameToGameId = new Map(matchingGames.map((game) => [game.name, game.id]));
    const matched = unmatchedKeys.filter((key) => nameToGameId.has(key.originalName));
    const unresolved = unmatchedKeys.length - matched.length;

    log.info("Resolving game keys", {
        total: unmatchedKeys.length,
        matched: matched.length,
        unresolved,
    });

    for (let i = 0; i < matched.length; i += BATCH_SIZE) {
        const batch = matched.slice(i, i + BATCH_SIZE);
        await prisma.$transaction(
            batch.map((key) =>
                prisma.keyVaultGame.update({
                    where: { id: key.id },
                    data: { gameId: nameToGameId.get(key.originalName) },
                }),
            ),
        );
    }

    log.info("Finished resolving game keys", {
        resolved: matched.length,
        stillUnresolved: unresolved,
    });
}

