import {Worker} from "bullmq";
import {trace, SpanStatusCode} from "@opentelemetry/api";

import prisma from "@/src/lib/prisma.js";
import {JobStatus, JobType} from "@/src/prisma/generated/enums.js";
import {
    QUEUE_NAMES,
    JobsQueuePayload,
    GameDetailsQueuePayload,
    jobsQueue, gameDetailsQueue,
} from "@/src/lib/job/queue.js";
import * as os from "node:os";
import {createLog} from "@/src/lib/job/log.js";
import importSteamLibrary from "@/src/jobs/import-steam-library.js";
import syncSteamGames from "@/src/jobs/sync-steam-games.js";
import {redis, redisOptions} from "@/src/lib/redis.js";
import fetchGameDetails from "@/src/jobs/fetch-game-details.js";
import {setInterval} from "node:timers";
import {flushLogs, logger} from "@/src/lib/logger.js";
import refreshGameDetails from "@/src/jobs/refresh-game-details.js";
import {randomUUID} from "node:crypto";

const log = logger.child("worker");

const HOSTNAME = os.hostname();
const tracer = trace.getTracer("gamepile-worker");
const JOBS_CONCURRENCY = Number(process.env.WORKER_JOBS_CONCURRENCY ?? 3);
const DETAILS_CONCURRENCY = Number(process.env.WORKER_DETAILS_CONCURRENCY ?? 10);
const STARTUP_DELAY_MS = Number(process.env.WORKER_STARTUP_DELAY_MS ?? 5 * 60 * 1_000);
const STALE_ACTIVE_RECOVERY_DELAY_MS = Number(process.env.WORKER_STALE_ACTIVE_RECOVERY_DELAY_MS ?? 30 * 60 * 1_000);
const ACTIVE_RECOVERY_LOCK_TTL_MS = Number(process.env.WORKER_ACTIVE_RECOVERY_LOCK_TTL_MS ?? 60_000);

let shuttingDown = false;

export let jobsWorker: Worker<JobsQueuePayload> | undefined;
export let detailsWorker: Worker<GameDetailsQueuePayload> | undefined;
let statusInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Gracefully shuts down the BullMQ workers, Redis connection, and Prisma client
 * before exiting the process. Subsequent calls are no-ops (guarded by `shuttingDown`).
 * Exits with code 0 on success or code 1 if an error is thrown during teardown.
 *
 * @param signal - The OS signal that triggered the shutdown (e.g. `"SIGTERM"`).
 * @returns A promise that resolves only if an error occurs before `process.exit`
 *   is called (in practice the process always exits inside this function).
 */
async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    log.info("Worker received shutdown signal. Initiating graceful shutdown...", {
        signal,
        hostname: HOSTNAME,
    });

    try {
        if (statusInterval) {
            clearInterval(statusInterval);
        }

        await Promise.all([
            jobsWorker ? jobsWorker.close() : Promise.resolve(),
            detailsWorker ? detailsWorker.close() : Promise.resolve(),
        ]);

        await Promise.all([
            prisma.$disconnect(),
            redis.quit(),
        ]);

        log.info("Worker shutdown complete. Exiting process", {
            hostname: HOSTNAME,
        });
        await flushLogs();
        process.exit(0);
    } catch (err) {
        log.error("Error during worker shutdown", err as Error);
        await flushLogs();
        process.exit(1);
    }
}

recoverStaleJobs().catch((err) =>
    log.error("Initial stale job recovery failed (non-fatal)", err instanceof Error ? err : undefined)
);

/**
 * Finds jobs that are stuck in `ACTIVE` status longer than
 * {@link STALE_ACTIVE_RECOVERY_DELAY_MS} and resets them back to `QUEUED` so they
 * can be retried. Uses a Redis distributed lock to ensure only one worker instance
 * runs recovery at a time.
 *
 * @returns A promise that resolves when recovery is complete. All errors are caught
 *   by the caller and logged as non-fatal.
 */
async function recoverStaleJobs(): Promise<void> {
    const lockKey = "gamepile:worker:recover-active-jobs:lock";
    const lockToken = `${HOSTNAME}:${randomUUID()}`;

    const lock = await redis.set(lockKey, lockToken, "PX", ACTIVE_RECOVERY_LOCK_TTL_MS, "NX");
    if (lock !== "OK") {
        log.info("Skipping stale ACTIVE recovery because another worker is running it.", {
            hostname: HOSTNAME,
            lockKey,
        });
        return;
    }

    const staleBefore = new Date(Date.now() - STALE_ACTIVE_RECOVERY_DELAY_MS);
    const activeQueueJobs = await jobsQueue.getActive();
    const activelyProcessingParentIds = new Set(
        activeQueueJobs
            .map((queuedJob) => queuedJob.data?.jobId)
            .filter((jobId): jobId is string => typeof jobId === "string" && jobId.length > 0),
    );

    log.info("Starting stale ACTIVE job recovery", {
        hostname: HOSTNAME,
        staleBefore: staleBefore.toISOString(),
        activeJobsCount: activeQueueJobs.length,
        activelyProcessingParentIds: Array.from(activelyProcessingParentIds),
    });

    const candidates = await prisma.job.findMany({
        where: {
            status: JobStatus.ACTIVE,
            startedAt: { lte: staleBefore },
            allItemsQueued: false
        },
        select: {
            id: true,
            claimedBy: true,
            startedAt: true,
        },
    });

    log.info("Found candidate stale ACTIVE job(s) for recovery", {
        hostname: HOSTNAME,
        candidatesCount: candidates.length,
    });

    let recoveredCount = 0;
    for (const candidate of candidates) {
        if (activelyProcessingParentIds.has(candidate.id)) {
            continue;
        }

        log.warn("Recovering stale ACTIVE job by resetting it to QUEUED", {
            hostname: HOSTNAME,
            jobId: candidate.id,
            claimedBy: candidate.claimedBy,
            startedAt: candidate.startedAt?.toISOString(),
        });

        const { count } = await prisma.job.updateMany({
            where: { id: candidate.id, status: JobStatus.ACTIVE },
            data: { status: JobStatus.QUEUED, claimedBy: null, startedAt: null },
        });

        if (count > 0) {
            recoveredCount += 1;
        }
    }

    if (recoveredCount > 0) {
        log.warn("Recovered stale ACTIVE job(s)", {
            hostname: HOSTNAME,
            recoveredJobs: recoveredCount,
            staleBefore: staleBefore.toISOString(),
            staleDelayMs: STALE_ACTIVE_RECOVERY_DELAY_MS,
        });
    }
}

/**
 * Registers (or updates) cron-scheduled BullMQ jobs for the two periodic tasks:
 * - `SYNC_STEAM_GAMES` — defaults to weekly (`0 3 * * 0`), overrideable via
 *   `SYNC_STEAM_GAMES_CRON`.
 * - `REFRESH_GAME_DETAILS` — defaults to daily (`0 2 * * *`), overrideable via
 *   `REFRESH_GAME_DETAILS_CRON`.
 *
 * Stores the resolved cron expressions in Redis under a versioned config key so that
 * all worker replicas use the same schedule. Throws if a config mismatch is detected
 * across workers.
 *
 * @returns A promise that resolves when both job schedulers have been upserted.
 * @throws {Error} If the scheduler config stored in Redis conflicts with the config
 *   derived from this worker's environment variables.
 */
async function registerScheduledJobs(): Promise<void> {
    const syncCron = process.env.WORKER_SYNC_STEAM_GAMES_CRON ?? "0 3 * * 0";
    const refreshCron = process.env.WORKER_REFRESH_GAME_DETAILS_CRON  ?? "0 0 * * *";
    const internalScheduledTaskCron =  "0 * * * *";
    const schedulerConfigKey = "gamepile:worker:scheduler-config:v1";
    const desiredSchedulerConfig = JSON.stringify({ syncCron, refreshCron });

    const wroteConfig = await redis.set(schedulerConfigKey, desiredSchedulerConfig, "NX");
    if (wroteConfig !== "OK") {
        const existingConfig = await redis.get(schedulerConfigKey);
        if (existingConfig !== desiredSchedulerConfig) {
            throw new Error(
                `Scheduler config mismatch across workers. existing=${existingConfig ?? "<missing>"}, desired=${desiredSchedulerConfig}`,
            );
        }
    }

    await jobsQueue.upsertJobScheduler(
        "gamepile.schedule.sync-steam-games",
        { pattern: syncCron },
        {
            name: JobType.SYNC_STEAM_GAMES,
            data: { type: JobType.SYNC_STEAM_GAMES },
        }
    );

    await jobsQueue.upsertJobScheduler(
        "gamepile.schedule.refresh-game-details",
        { pattern: refreshCron },
        {
            name: JobType.REFRESH_GAME_DETAILS,
            data: { type: JobType.REFRESH_GAME_DETAILS },
        }
    );

    await jobsQueue.upsertJobScheduler(
        "gamepile.schedule.internal-scheduled-task",
        { pattern: internalScheduledTaskCron },
        {
            name: JobType.INTERNAL_SCHEDULED_TASK,
            data: { type: JobType.INTERNAL_SCHEDULED_TASK },
        }
    )

    log.info("Scheduled jobs registered", {
        hostname: HOSTNAME,
        scheduledJobs: [
            { name: "SYNC_STEAM_GAMES", cron: syncCron },
            { name: "REFRESH_GAME_DETAILS", cron: refreshCron },
        ]
    });
}

/**
 * Checks whether any SYNC_STEAM_GAMES job has ever been queued or run.
 * If not, queues an initial full sync so the catalog is populated on first boot.
 */
async function ensureInitialSyncQueued(): Promise<void> {
    const hasAnySync = await prisma.job.findFirst({
        where: {
            type: JobType.SYNC_STEAM_GAMES,
            status: {
                in: [
                    JobStatus.ACTIVE,
                    JobStatus.QUEUED,
                    JobStatus.COMPLETED,
                    JobStatus.PARTIALLY_COMPLETED,
                ],
            },
        },
        select: { id: true },
    });

    if (hasAnySync) {
        log.info("Initial sync already exists — skipping first-boot seed", { hostname: HOSTNAME });
        return;
    }

    log.info("First boot detected — queuing initial SYNC_STEAM_GAMES job", { hostname: HOSTNAME });

    const dbJob = await prisma.job.create({
        data: { type: JobType.SYNC_STEAM_GAMES },
    });

    await jobsQueue.add(JobType.SYNC_STEAM_GAMES, {
        jobId: dbJob.id,
        type: JobType.SYNC_STEAM_GAMES,
    });

    log.info("Initial sync job queued", { jobId: dbJob.id, hostname: HOSTNAME });
}

/**
 * Initialises and starts the BullMQ workers after an optional startup delay.
 *
 * Steps performed in order:
 * 1. Waits for {@link STARTUP_DELAY_MS} (configurable via `WORKER_STARTUP_DELAY_MS`)
 *    to allow dependent services to become ready.
 * 2. Runs {@link recoverStaleJobs} to reset any stuck `ACTIVE` jobs.
 * 3. Calls {@link registerScheduledJobs} to upsert cron-triggered job schedulers.
 * 4. Creates `jobsWorker` (orchestrator, concurrency = `JOBS_CONCURRENCY`) and
 *    `detailsWorker` (per-game detail fetcher, concurrency = `DETAILS_CONCURRENCY`).
 * 5. Starts a periodic status-logging interval every 2 minutes.
 *
 * @returns A promise that resolves once both workers are constructed and listening.
 * @throws {Error} If worker construction or scheduler registration fails.
 */
async function initWorkers(): Promise<void> {
    if (STARTUP_DELAY_MS > 0) {
        log.info("Worker startup delay in effect", {
            hostname: HOSTNAME,
            delayMs: STARTUP_DELAY_MS,
        });
        await new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY_MS));
    }

    await recoverStaleJobs().catch((err) =>
        log.error("Stale job recovery failed (non-fatal)", err instanceof Error ? err : undefined)
    );

    await registerScheduledJobs();

    await ensureInitialSyncQueued().catch((err) =>
        log.error("First-boot sync check failed (non-fatal)", err instanceof Error ? err : undefined)
    );

    jobsWorker = new Worker<JobsQueuePayload>(QUEUE_NAMES.JOBS, async (job) => {
        const {type, userId} = job.data;
        let {jobId} = job.data;

        return tracer.startActiveSpan(`job.${type}`, async (span) => {
            span.setAttributes({
                "job.type": type,
                "job.id": jobId ?? "",
                "job.queue": QUEUE_NAMES.JOBS,
                "worker.host": HOSTNAME,
            });

            try {
                if (!jobId) {
                    const dbJob = await prisma.job.create({
                        data: {type, userId: userId ?? null},
                    });

                    jobId = dbJob.id;
                    await job.updateData({ ...job.data, jobId });
                    span.setAttribute("job.id", jobId);
                    log.info("Created database record for scheduled job", {jobId, type, hostname: HOSTNAME});
                }

                const resolvedJobId: string = jobId!;

                log.info("Worker processing job", {jobId: resolvedJobId, type, hostname: HOSTNAME});

                await prisma.job.update({
                    where: {id: resolvedJobId},
                    data: {status: JobStatus.ACTIVE, startedAt: new Date(), claimedBy: HOSTNAME},
                });

                await createLog(resolvedJobId, "info", "Worker picked up job");

                switch (type) {
                    case "IMPORT_USER_LIBRARY":
                        if (!userId) {
                            throw new Error(`IMPORT_USER_LIBRARY requires a userId but none was provided: jobId=${resolvedJobId}`);
                        }

                        await importSteamLibrary({jobId: resolvedJobId, userId});

                        break;
                    case "SYNC_STEAM_GAMES":
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
                                jobId: resolvedJobId,
                                ifModifiedSince,
                                lastSync: new Date(ifModifiedSince * 1000).toISOString(),
                            });
                            await createLog(
                                resolvedJobId,
                                "info",
                                `Incremental sync — fetching apps modified since ${new Date(ifModifiedSince * 1000).toISOString()}.`,
                            );
                        } else {
                            log.info("Running full Steam sync (no previous successful sync found)", {
                                jobId: resolvedJobId,
                            });
                            await createLog(resolvedJobId, "info", "Full catalog sync — no previous run detected.");
                        }

                        await syncSteamGames({
                            jobId: resolvedJobId,
                            ignoreLastModified: ifModifiedSince === undefined,
                            ifModifiedSince,
                        });
                        break;
                    case JobType.REFRESH_GAME_DETAILS:
                        await refreshGameDetails({jobId: resolvedJobId});
                        break;
                    case JobType.INTERNAL_SCHEDULED_TASK:
                        const IMPORT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
                        const cutoffDate = new Date(Date.now() - IMPORT_INTERVAL_MS);

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
                                jobId: resolvedJobId,
                                userId: user.id,
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
                            log.info("No unmatched game keys to resolve", { jobId: resolvedJobId });
                            return;
                        }

                        const uniqueNames = [...new Set(unmatchedKeys.map((k) => k.originalName))];

                        const matchingGames = await prisma.game.findMany({
                            where: { name: { in: uniqueNames } },
                            select: { id: true, name: true },
                        });

                        if (!matchingGames.length) {
                            log.info("No matching games found for unmatched keys", { jobId: resolvedJobId });
                            return;
                        }

                        const nameToGameId = new Map(matchingGames.map((g) => [g.name, g.id]));

                        const matched = unmatchedKeys.filter((k) => nameToGameId.has(k.originalName));
                        const unresolved = unmatchedKeys.length - matched.length;

                        log.info("Resolving game keys", {
                            jobId: resolvedJobId,
                            total: unmatchedKeys.length,
                            matched: matched.length,
                            unresolved,
                        });

                        const BATCH_SIZE = 100;

                        for (let i = 0; i < matched.length; i += BATCH_SIZE) {
                            const batch = matched.slice(i, i + BATCH_SIZE);

                            await prisma.$transaction(
                                batch.map((k) =>
                                    prisma.keyVaultGame.update({
                                        where: { id: k.id },
                                        data: { gameId: nameToGameId.get(k.originalName) },
                                    })
                                )
                            );
                        }

                        log.info("Finished resolving game keys", {
                            jobId: resolvedJobId,
                            resolved: matched.length,
                            stillUnresolved: unresolved,
                        });

                        await prisma.job.update({
                            where: { id: resolvedJobId },
                            data: { status: JobStatus.COMPLETED, finishedAt: new Date() },
                        });

                        log.info("Internal scheduled task completed", { jobId: resolvedJobId });

                        break;
                    default:
                        throw new Error(`Unknown job type: ${type}`);
                }

                span.setStatus({code: SpanStatusCode.OK});
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error";
                const resolvedJobId = jobId!;

                span.setStatus({code: SpanStatusCode.ERROR, message});
                span.recordException(error as Error);

                log.error("Job failed", error instanceof Error ? error : undefined, { jobId: resolvedJobId, type });

                await prisma.job.update({
                    where: {id: resolvedJobId},
                    data: {status: JobStatus.FAILED, finishedAt: new Date(), errorMessage: message},
                });

                await redis.set(`cancel:parent:${resolvedJobId}`, "1", "EX", 2 * 60 * 60);

                await createLog(resolvedJobId, "error", `Job failed: ${message}`);

                throw error;
            } finally {
                span.end();
            }
        });
    }, {
        connection: redisOptions,
        concurrency: JOBS_CONCURRENCY,
    }).on("error", (error) => {
        log.error("Jobs worker encountered an error", error);
    }).on("ready", () => {
        log.info("Jobs worker is ready and waiting for jobs", {
            ips: Object.values(os.networkInterfaces())
                .flat()
                .filter((iface): iface is os.NetworkInterfaceInfo => !!iface && iface.family === "IPv4" && !iface.internal)
                .map((iface) => iface.address),
            hostname: HOSTNAME,
            concurrency: JOBS_CONCURRENCY
        });
    });

    detailsWorker = new Worker<GameDetailsQueuePayload>(QUEUE_NAMES.GAME_DETAILS, async (job) => {
        return tracer.startActiveSpan(`job.FETCH_GAME_DETAILS`, async (span) => {
            span.setAttributes({
                "job.type": "FETCH_GAME_DETAILS",
                "job.id": job.id ?? "",
                "job.queue": QUEUE_NAMES.GAME_DETAILS,
                "job.appId": job.data.appId,
                "job.parentJobId": job.data.parentJobId,
                "worker.host": HOSTNAME,
            });

            try {
                await fetchGameDetails(job);
                span.setStatus({code: SpanStatusCode.OK});
            } catch (error) {
                span.setStatus({code: SpanStatusCode.ERROR, message: (error as Error).message});
                span.recordException(error as Error);
                throw error;
            } finally {
                span.end();
            }
        });
    }, {
        connection: redisOptions,
        concurrency: DETAILS_CONCURRENCY,
    }).on("error", (error) => {
        log.error("Details worker encountered an error", error);
    }).on("ready", () => {
        log.info("Details worker is ready and waiting for jobs", {
            ips: Object.values(os.networkInterfaces())
                .flat()
                .filter((iface): iface is os.NetworkInterfaceInfo => !!iface && iface.family === "IPv4" && !iface.internal)
                .map((iface) => iface.address),
            hostname: HOSTNAME,
            concurrency: JOBS_CONCURRENCY
        });
    });

    statusInterval = setInterval(async () => {
        const [
            rateLimitJobsActive,
            rateLimitJobsDelayed,
            rateLimitJobsWaiting,
            rateLimitJobsFailed,
            rateLimitJobsCompleted,
            rateLimitJobsPriorityCounts,
        ] = await Promise.all([
            gameDetailsQueue.getActiveCount(),
            gameDetailsQueue.getDelayedCount(),
            gameDetailsQueue.getWaitingCount(),
            gameDetailsQueue.getFailedCount(),
            gameDetailsQueue.getCompletedCount(),
            gameDetailsQueue.getCountsPerPriority([...Array(10).keys()])
        ]);

        const [
            mainWorkerJobsActive,
            mainWorkerJobsDelayed,
            mainWorkerJobsWaiting,
            mainWorkerJobsFailed,
            mainWorkerJobsCompleted,
            mainWorkerJobsPriorityCounts
        ] = await Promise.all([
            jobsQueue.getActiveCount(),
            jobsQueue.getDelayedCount(),
            jobsQueue.getWaitingCount(),
            jobsQueue.getFailedCount(),
            jobsQueue.getCompletedCount(),
            jobsQueue.getCountsPerPriority([...Array(10).keys()])
        ]);

        log.info("Worker status update", {
            rateLimitQueue: {
                active: rateLimitJobsActive,
                delayed: rateLimitJobsDelayed,
                waiting: rateLimitJobsWaiting,
                failed: rateLimitJobsFailed,
                completed: rateLimitJobsCompleted,
                priority: Object.fromEntries(Object.entries(rateLimitJobsPriorityCounts).filter(([_, count]) => count > 0))
            },
            mainQueue: {
                active: mainWorkerJobsActive,
                delayed: mainWorkerJobsDelayed,
                waiting: mainWorkerJobsWaiting,
                failed: mainWorkerJobsFailed,
                completed: mainWorkerJobsCompleted,
                priority: Object.fromEntries(Object.entries(mainWorkerJobsPriorityCounts).filter(([_, count]) => count > 0))
            },
            hostname: HOSTNAME
        });
    }, 2 * 60 * 1_000);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT",  () => void shutdown("SIGINT"));

void initWorkers().catch((err) => {
    log.error("Failed to initialize workers", err instanceof Error ? err : undefined);
    process.exit(1);
});