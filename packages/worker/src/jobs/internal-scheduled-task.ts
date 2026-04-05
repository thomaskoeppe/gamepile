import {JobStatus, JobType} from "@/src/prisma/generated/enums.js";

import {createLog} from "@/src/lib/job/log.js";
import {jobsQueue} from "@/src/lib/job/queue.js";
import {logger} from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";

/** Number of key-vault game records to update per batch transaction. */
const KEY_RESOLVE_BATCH_SIZE = 100;

/**
 * Runs the daily internal scheduled task that performs housekeeping operations.
 *
 * Currently, executes two sub-tasks:
 * 1. Schedules recurring library imports for users who haven't been imported recently.
 * 2. Resolves unmatched game keys in vaults by matching against the game catalog.
 *
 * @param payload - Task parameters.
 * @param payload.jobId - The database job ID tracking this task.
 * @param payload.importUserLibraryIntervalMs - Minimum interval between library imports per user.
 */
export async function runInternalScheduledTask(payload: {
    jobId: string;
    importUserLibraryIntervalMs: number;
}): Promise<void> {
    const { jobId, importUserLibraryIntervalMs } = payload;
    const log = logger.child("worker.jobs:internalScheduledTask", { jobId });

    await scheduleLibraryImports(jobId, importUserLibraryIntervalMs, log);
    await resolveUnmatchedGameKeys(jobId, log);
}

/**
 * Schedules `IMPORT_USER_LIBRARY` jobs for users who haven't been imported recently.
 *
 * Skips users who:
 * - Have a completed import within the configured interval.
 * - Already have a pending (queued or active) import job.
 *
 * @param jobId - The parent task's job ID (for logging).
 * @param intervalMs - Minimum interval (ms) between imports for the same user.
 * @param log - A child logger instance for contextual log messages.
 */
async function scheduleLibraryImports(
    jobId: string,
    intervalMs: number,
    log: ReturnType<typeof logger.child>,
): Promise<void> {
    const cutoffDate = new Date(Date.now() - intervalMs);

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

    const skipUserIds = new Set([
        ...recentlyImported.map((j) => j.userId!),
        ...alreadyPending.map((j) => j.userId!),
    ]);

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

    if (usersToImport.length === 0) {
        await createLog(jobId, "info", "No users require library import at this time");
    } else {
        await createLog(jobId, "info", `Scheduled library imports for ${usersToImport.length} user(s)`);
    }
}

/**
 * Attempts to match unlinked game keys (where `gameId` is null) to games in
 * the catalog by exact name matching.
 *
 * Updates matched `KeyVaultGame` records in batched transactions.
 *
 * @param jobId - The parent task's job ID (for logging).
 * @param log - A child logger instance for contextual log messages.
 */
async function resolveUnmatchedGameKeys(
    jobId: string,
    log: ReturnType<typeof logger.child>,
): Promise<void> {
    const unmatchedKeys = await prisma.keyVaultGame.findMany({
        where: { gameId: null },
        select: { id: true, originalName: true },
    });

    if (unmatchedKeys.length === 0) {
        log.debug("No unmatched game keys to resolve");
        await createLog(jobId, "info", "No unmatched game keys to resolve");
        return;
    }

    const uniqueNames = [...new Set(unmatchedKeys.map((key) => key.originalName))];

    const matchingGames = await prisma.game.findMany({
        where: { name: { in: uniqueNames } },
        select: { id: true, name: true },
    });

    if (matchingGames.length === 0) {
        log.debug("No matching games found for unmatched keys");
        await createLog(jobId, "info", "No matching games found for unmatched keys");
        return;
    }

    const nameToGameId = new Map(matchingGames.map((game) => [game.name, game.id]));
    const matched = unmatchedKeys.filter((key) => nameToGameId.has(key.originalName));
    const unresolvedCount = unmatchedKeys.length - matched.length;

    log.info("Resolving game keys", {
        total: unmatchedKeys.length,
        matched: matched.length,
        unresolved: unresolvedCount,
    });

    await createLog(jobId, "info",
        `Resolving game keys: ${matched.length} matched, ${unresolvedCount} still unresolved`,
    );

    for (let i = 0; i < matched.length; i += KEY_RESOLVE_BATCH_SIZE) {
        const batch = matched.slice(i, i + KEY_RESOLVE_BATCH_SIZE);
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
        stillUnresolved: unresolvedCount,
    });

    await createLog(jobId, "info",
        `Finished resolving game keys: ${matched.length} resolved, ${unresolvedCount} still unresolved`,
    );
}
