import { JobStatus, JobType } from "@/src/prisma/generated/enums.js";

import fetchImportSteamLibrary from "@/src/jobs/import-steam-library.js";
import { runInternalScheduledTask } from "@/src/jobs/internal-scheduled-task.js";
import refreshGameDetails from "@/src/jobs/refresh-game-details.js";
import syncSteamGames from "@/src/jobs/sync-steam-games.js";
import { tryCompleteParentJob } from "@/src/lib/job/completion.js";
import { createLog } from "@/src/lib/job/log.js";
import { logger } from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";

export class UnhandledJobTypeError extends Error {
    constructor(type: never) {
        super(`Unhandled job type: ${String(type)}`);
        this.name = "UnhandledJobTypeError";
    }
}

export async function handleJobByType(payload: {
    type: JobType;
    userId?: string;
    internalScheduler?: boolean;
    resolvedJobId: string;
    importUserLibraryIntervalMs: number;
}) {
    const { type, userId, internalScheduler, resolvedJobId, importUserLibraryIntervalMs } = payload;
    const log = logger.child("worker.handlers.jobs:dispatch", {
        jobId: resolvedJobId,
        type,
        userId,
    });

    switch (type) {
        case JobType.IMPORT_USER_LIBRARY:
            if (!userId) {
                throw new Error(`IMPORT_USER_LIBRARY requires a userId but none was provided: jobId=${resolvedJobId}`);
            }
            await fetchImportSteamLibrary({ jobId: resolvedJobId, userId });
            break;
        case JobType.SYNC_STEAM_GAMES: {
            const lastSuccessfulSync = await prisma.job.findFirst({
                where: {
                    type: JobType.SYNC_STEAM_GAMES,
                    status: {
                        in: [JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED],
                    },
                },
                orderBy: { finishedAt: "desc" },
                select: { finishedAt: true },
            });

            const ifModifiedSince = lastSuccessfulSync?.finishedAt
                ? Math.floor(lastSuccessfulSync.finishedAt.getTime() / 1000)
                : undefined;

            if (ifModifiedSince) {
                log.info("Running incremental Steam sync", {
                    ifModifiedSince,
                    lastSync: new Date(ifModifiedSince * 1000).toISOString(),
                });
                await createLog(
                    resolvedJobId,
                    "info",
                    `Incremental sync - fetching apps modified since ${new Date(ifModifiedSince * 1000).toISOString()}.`,
                );
            } else {
                log.info("Running full Steam sync (no previous successful sync found)");
                await createLog(resolvedJobId, "info", "Full catalog sync - no previous run detected.");
            }

            await syncSteamGames({
                jobId: resolvedJobId,
                ignoreLastModified: ifModifiedSince === undefined,
                ifModifiedSince,
            });
            break;
        }
        case JobType.REFRESH_GAME_DETAILS:
            await refreshGameDetails({ jobId: resolvedJobId });
            break;
        case JobType.INTERNAL_SCHEDULED_TASK:
            if (!internalScheduler) {
                throw new Error("INTERNAL_SCHEDULED_TASK may only be enqueued by the scheduler.");
            }
            await runInternalScheduledTask({
                jobId: resolvedJobId,
                importUserLibraryIntervalMs,
            });
            await tryCompleteParentJob(resolvedJobId);
            break;
        case JobType.IMPORT_USER_ACHIEVEMENTS:
            throw new Error("IMPORT_USER_ACHIEVEMENTS is not implemented yet.");
        default:
            throw new UnhandledJobTypeError(type as never);
    }
}

