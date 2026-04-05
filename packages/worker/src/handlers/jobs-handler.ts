import { JobStatus, JobType } from "@/src/prisma/generated/enums.js";

import importSteamLibrary from "@/src/jobs/import-steam-library.js";
import { runInternalScheduledTask } from "@/src/jobs/internal-scheduled-task.js";
import refreshGameDetails from "@/src/jobs/refresh-game-details.js";
import syncSteamCategories from "@/src/jobs/sync-steam-categories.js";
import syncSteamGames from "@/src/jobs/sync-steam-games.js";
import syncSteamTags from "@/src/jobs/sync-steam-tags.js";
import { createLog } from "@/src/lib/job/log.js";
import { logger } from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";

/**
 * Error thrown when a job type is encountered that has no registered handler.
 *
 * Uses TypeScript's `never` type in the constructor to ensure exhaustive
 * switch coverage at compile time.
 */
class UnhandledJobTypeError extends Error {
    /**
     * @param type - The unhandled job type value (typed as `never` for exhaustiveness).
     */
    constructor(type: never) {
        super(`Unhandled job type: ${String(type)}`);
        this.name = "UnhandledJobTypeError";
    }
}

/**
 * Dispatches a job to the appropriate handler based on its {@link JobType}.
 *
 * This is the central routing function for the main jobs queue. After the
 * handler completes, some job types have their status updated to `COMPLETED`
 * here (tags, categories, internal tasks), while others manage their own
 * completion (sync, refresh, import).
 *
 * @param payload - Job dispatch parameters.
 * @param payload.type - The type of job to execute.
 * @param payload.userId - Optional user ID for user-scoped jobs.
 * @param payload.internalScheduler - Whether the job was enqueued by the internal scheduler.
 * @param payload.resolvedJobId - The database job ID (guaranteed to exist).
 * @param payload.importUserLibraryIntervalMs - Interval for recurring library imports.
 * @throws {Error} If a required field (e.g., `userId`) is missing for the given job type.
 * @throws {UnhandledJobTypeError} If the job type has no registered handler.
 */
export async function handleJobByType(payload: {
    type: JobType;
    userId?: string;
    internalScheduler?: boolean;
    resolvedJobId: string;
    importUserLibraryIntervalMs: number;
}): Promise<void> {
    const { type, userId, internalScheduler, resolvedJobId, importUserLibraryIntervalMs } = payload;
    const log = logger.child("worker.handlers.jobs:dispatch", {
        jobId: resolvedJobId,
        type,
        userId,
    });

    switch (type) {
        case JobType.IMPORT_USER_LIBRARY: {
            if (!userId) {
                throw new Error(
                    `IMPORT_USER_LIBRARY requires a userId but none was provided (jobId=${resolvedJobId})`,
                );
            }
            await importSteamLibrary({ jobId: resolvedJobId, userId });
            break;
        }

        case JobType.SYNC_STEAM_GAMES: {
            const { ifModifiedSince } = await findLastSyncTimestamp(resolvedJobId, log);

            await syncSteamGames({
                jobId: resolvedJobId,
                ignoreLastModified: ifModifiedSince === undefined,
                ifModifiedSince,
            });
            break;
        }

        case JobType.REFRESH_GAME_DETAILS: {
            await refreshGameDetails({ jobId: resolvedJobId });
            break;
        }

        case JobType.SYNC_STEAM_TAGS: {
            await syncSteamTags({ jobId: resolvedJobId });

            await prisma.job.update({
                where: { id: resolvedJobId },
                data: { status: JobStatus.COMPLETED, finishedAt: new Date() },
            });

            await createLog(resolvedJobId, "info", "Steam tags sync completed successfully.");
            break;
        }

        case JobType.SYNC_STEAM_CATEGORIES: {
            await syncSteamCategories({ jobId: resolvedJobId });

            await prisma.job.update({
                where: { id: resolvedJobId },
                data: { status: JobStatus.COMPLETED, finishedAt: new Date() },
            });

            await createLog(resolvedJobId, "info", "Steam categories sync completed successfully.");
            break;
        }

        case JobType.INTERNAL_SCHEDULED_TASK: {
            if (!internalScheduler) {
                throw new Error("INTERNAL_SCHEDULED_TASK may only be enqueued by the scheduler.");
            }

            await runInternalScheduledTask({
                jobId: resolvedJobId,
                importUserLibraryIntervalMs,
            });

            await prisma.job.update({
                where: { id: resolvedJobId },
                data: { status: JobStatus.COMPLETED, finishedAt: new Date() },
            });

            await createLog(resolvedJobId, "info", "Internal scheduled task completed successfully.");
            break;
        }

        case JobType.IMPORT_USER_ACHIEVEMENTS: {
            throw new Error("IMPORT_USER_ACHIEVEMENTS is not implemented yet.");
        }

        default:
            throw new UnhandledJobTypeError(type as never);
    }
}

/**
 * Finds the timestamp of the last successful `SYNC_STEAM_GAMES` job.
 *
 * Used to perform incremental syncs — only fetching apps modified since
 * the last completed sync. Returns `undefined` if no previous sync exists.
 *
 * @param resolvedJobId - The current job ID (used for logging).
 * @param log - A child logger instance for contextual log messages.
 * @returns An object containing `ifModifiedSince` as a Unix timestamp, or `undefined`.
 */
async function findLastSyncTimestamp(
    resolvedJobId: string,
    log: ReturnType<typeof logger.child>,
): Promise<{ ifModifiedSince: number | undefined }> {
    const lastSuccessfulSync = await prisma.job.findFirst({
        where: {
            type: JobType.SYNC_STEAM_GAMES,
            status: { in: [JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED] },
        },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
    });

    const ifModifiedSince = lastSuccessfulSync?.finishedAt
        ? Math.floor(lastSuccessfulSync.finishedAt.getTime() / 1000)
        : undefined;

    if (ifModifiedSince) {
        const lastSyncIso = new Date(ifModifiedSince * 1000).toISOString();
        log.info("Running incremental Steam sync", { ifModifiedSince, lastSync: lastSyncIso });
        await createLog(resolvedJobId, "info",
            `Incremental sync - fetching apps modified since ${lastSyncIso}.`,
        );
    } else {
        log.info("Running full Steam sync (no previous successful sync found)");
        await createLog(resolvedJobId, "info", "Full catalog sync - no previous run detected.");
    }

    return { ifModifiedSince };
}
