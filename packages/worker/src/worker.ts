/**
 * Core worker module — creates and manages BullMQ worker instances for
 * the main jobs queue and the game-details queue.
 *
 * Handles worker lifecycle (startup delay, recovery, scheduling, heartbeats)
 * and wraps each job execution in an OpenTelemetry span for distributed tracing.
 *
 * @module worker
 */
import * as os from "node:os";
import {setInterval} from "node:timers";

import {SpanStatusCode, trace} from "@opentelemetry/api";
import {Worker} from "bullmq";
import {WORKER_METRICS} from "@gamepile/shared/worker-metrics";

import handleFetchGameDetails from "@/src/jobs/fetch-game-details.js";
import {handleJobByType} from "@/src/handlers/jobs-handler.js";
import {getWorkerEnv} from "@/src/lib/env.js";
import {createLog} from "@/src/lib/job/log.js";
import {
    gameDetailsQueue,
    type GameDetailsQueuePayload,
    jobsQueue,
    type JobsQueuePayload,
    QUEUE_NAMES,
} from "@/src/lib/job/queue.js";
import {flushLogs, logger} from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";
import {redis, redisOptions} from "@/src/lib/redis.js";
import {publishWorkerHeartbeat, removeWorkerHeartbeat} from "@/src/lib/worker-metrics.js";
import {JobStatus} from "@/src/prisma/generated/enums.js";
import {recoverStaleJobs} from "@/src/recovery.js";
import {ensureInitialSyncQueued, registerScheduledJobs} from "@/src/scheduler.js";

const log = logger.child("worker");
const tracer = trace.getTracer("gamepile-worker");
const HOSTNAME = os.hostname();
const env = getWorkerEnv();

const JOBS_CONCURRENCY = env.WORKER_JOBS_CONCURRENCY;
const DETAILS_CONCURRENCY = env.WORKER_DETAILS_CONCURRENCY;
const STARTUP_DELAY_MS = env.WORKER_STARTUP_DELAY_MS;
const STATUS_LOG_INTERVAL_MS = 2 * 60 * 1_000;

let shuttingDown = false;
let jobsWorker: Worker<JobsQueuePayload> | undefined;
let detailsWorker: Worker<GameDetailsQueuePayload> | undefined;
let statusInterval: ReturnType<typeof setInterval> | undefined;
let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Gracefully shuts down both BullMQ workers and cleans up resources.
 *
 * Stops status and heartbeat intervals, closes workers, removes the heartbeat
 * entry from Redis, disconnects Prisma, and quits the Redis client.
 *
 * @param signal - The OS signal that triggered the shutdown.
 * @throws {Error} Re-throws any error encountered during shutdown after logging it.
 */
export async function shutdownWorkers(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    log.info("Worker received shutdown signal", {signal, hostname: HOSTNAME});

    try {
        if (statusInterval) clearInterval(statusInterval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        await Promise.all([
            jobsWorker?.close(),
            detailsWorker?.close(),
        ]);

        await removeWorkerHeartbeat(HOSTNAME, process.pid);
        await Promise.all([prisma.$disconnect(), redis.quit()]);
        log.info("Worker shutdown complete", {hostname: HOSTNAME});
        await flushLogs();
    } catch (error) {
        log.error("Error during worker shutdown", error as Error);
        await flushLogs();
        throw error;
    }
}

/**
 * Starts a periodic interval that logs queue status metrics (active, delayed,
 * waiting, failed, completed counts and per-priority breakdowns) for both queues.
 */
function startStatusInterval(): void {
    statusInterval = setInterval(async () => {
        try {
            const priorities = [...Array(10).keys()];

            const [
                detailsActive, detailsDelayed, detailsWaiting,
                detailsFailed, detailsCompleted, detailsPriority,
                mainActive, mainDelayed, mainWaiting,
                mainFailed, mainCompleted, mainPriority,
            ] = await Promise.all([
                gameDetailsQueue.getActiveCount(),
                gameDetailsQueue.getDelayedCount(),
                gameDetailsQueue.getWaitingCount(),
                gameDetailsQueue.getFailedCount(),
                gameDetailsQueue.getCompletedCount(),
                gameDetailsQueue.getCountsPerPriority(priorities),
                jobsQueue.getActiveCount(),
                jobsQueue.getDelayedCount(),
                jobsQueue.getWaitingCount(),
                jobsQueue.getFailedCount(),
                jobsQueue.getCompletedCount(),
                jobsQueue.getCountsPerPriority(priorities),
            ]);

            const nonZeroPriority = (counts: Record<string, number>) =>
                Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));

            log.debug("Worker status update", {
                gameDetailsQueue: {
                    active: detailsActive, delayed: detailsDelayed, waiting: detailsWaiting,
                    failed: detailsFailed, completed: detailsCompleted,
                    priority: nonZeroPriority(detailsPriority),
                },
                mainQueue: {
                    active: mainActive, delayed: mainDelayed, waiting: mainWaiting,
                    failed: mainFailed, completed: mainCompleted,
                    priority: nonZeroPriority(mainPriority),
                },
                hostname: HOSTNAME,
            });
        } catch (error) {
            log.warn("Failed to collect queue status", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }, STATUS_LOG_INTERVAL_MS);
}

/**
 * Starts a periodic interval that publishes a worker heartbeat to Redis.
 *
 * The heartbeat is published immediately on first call and then at the
 * configured interval from {@link WORKER_METRICS.heartbeatIntervalMs}.
 */
function startHeartbeatInterval(): void {
    const publishHeartbeat = async () => {
        try {
            await publishWorkerHeartbeat(HOSTNAME, process.pid);
        } catch (error) {
            log.warn("Failed to publish worker heartbeat", {
                hostname: HOSTNAME,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    };

    void publishHeartbeat();
    heartbeatInterval = setInterval(() => {
        void publishHeartbeat();
    }, WORKER_METRICS.heartbeatIntervalMs);
}

/**
 * Initializes the worker: applies the startup delay, recovers stale jobs,
 * registers scheduled jobs, ensures the initial sync exists, then creates
 * both BullMQ workers and starts status/heartbeat intervals.
 */
async function initWorkers(): Promise<void> {
    if (STARTUP_DELAY_MS > 0) {
        log.info("Worker startup delay in effect", {delayMs: STARTUP_DELAY_MS});
        // await new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY_MS));
    }

    await recoverStaleJobs({
        hostname: HOSTNAME,
        staleActiveRecoveryDelayMs: env.WORKER_STALE_ACTIVE_RECOVERY_DELAY_MS,
        activeRecoveryLockTtlMs: env.WORKER_ACTIVE_RECOVERY_LOCK_TTL_MS,
    }).catch((error) => log.warn("Stale job recovery failed (non-fatal)", {
        message: error instanceof Error ? error.message : "Unknown error",
    }));

    await registerScheduledJobs(HOSTNAME);

    await ensureInitialSyncQueued(HOSTNAME).catch((error) =>
        log.warn("First-boot sync check failed (non-fatal)", {
            message: error instanceof Error ? error.message : "Unknown error",
        }),
    );

    jobsWorker = createJobsWorker();
    detailsWorker = createDetailsWorker();

    startStatusInterval();
    startHeartbeatInterval();
}

/**
 * Creates and returns the BullMQ worker for the main `gamepile.jobs` queue.
 *
 * Each job is wrapped in an OpenTelemetry span. On failure, the job is marked
 * as `FAILED` in the database and a cancellation flag is set in Redis.
 *
 * @returns A configured BullMQ {@link Worker} instance for the jobs queue.
 */
function createJobsWorker(): Worker<JobsQueuePayload> {
    return new Worker<JobsQueuePayload>(
        QUEUE_NAMES.JOBS,
        async (job) => {
            const { type, userId, internalScheduler } = job.data;
            let { jobId } = job.data;

            return tracer.startActiveSpan(`job.${type}`, async (span) => {
                span.setAttributes({
                    "job.type": type,
                    "job.id": jobId ?? "",
                    "job.queue": QUEUE_NAMES.JOBS,
                    "worker.host": HOSTNAME,
                });

                try {
                    jobId = await ensureDbJobExists(job, jobId, type, userId, span);

                    await prisma.job.update({
                        where: {id: jobId},
                        data: { status: JobStatus.ACTIVE, startedAt: new Date(), claimedBy: HOSTNAME },
                    });

                    await createLog(jobId, "info", "Worker picked up job");

                    await handleJobByType({
                        type,
                        userId,
                        internalScheduler,
                        resolvedJobId: jobId,
                        importUserLibraryIntervalMs: env.WORKER_IMPORT_USER_LIBRARY_INTERVAL_MS,
                    });

                    span.setStatus({ code: SpanStatusCode.OK });
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Unknown error";

                    span.setStatus({ code: SpanStatusCode.ERROR, message });
                    span.recordException(error as Error);

                    log.error("Job failed", error instanceof Error ? error : undefined, {
                        jobId,
                        type,
                    });

                    if (jobId) {
                        await prisma.job.update({
                            where: {id: jobId},
                            data: {status: JobStatus.FAILED, finishedAt: new Date(), errorMessage: message},
                        });

                        await redis.set(`cancel:parent:${jobId}`, "1", "EX", 2 * 60 * 60);
                        await createLog(jobId, "error", `Job failed: ${message}`);
                    }

                    throw error;
                } finally {
                    span.end();
                }
            });
        },
        {connection: redisOptions, concurrency: JOBS_CONCURRENCY},
    )
        .on("error", (error) => log.error("Jobs worker encountered an error", error))
        .on("ready", () => log.info("Jobs worker is ready", {concurrency: JOBS_CONCURRENCY}));
}

/**
 * Ensures a database `Job` record exists for the given BullMQ job.
 *
 * If `jobId` is already provided, returns it immediately. Otherwise, creates
 * a new `Job` record and updates the BullMQ job data with the generated ID.
 * Rolls back the created record if the data update fails.
 *
 * @param job - The BullMQ job instance.
 * @param jobId - Existing database job ID, or `undefined` to create one.
 * @param type - The job type enum value.
 * @param userId - Optional user ID for user-scoped jobs.
 * @param span - The active OpenTelemetry span to update with the job ID.
 * @returns The resolved database job ID.
 * @throws {Error} If the BullMQ job data update fails after creating the DB record.
 */
async function ensureDbJobExists(
    job: { data: JobsQueuePayload; updateData: (data: JobsQueuePayload) => Promise<void> },
    jobId: string | undefined,
    type: JobsQueuePayload["type"],
    userId: string | undefined,
    span: { setAttribute: (key: string, value: string) => void },
): Promise<string> {
    if (jobId) return jobId;

    const dbJob = await prisma.job.create({
        data: {type, userId: userId ?? null},
    });

    try {
        await job.updateData({...job.data, jobId: dbJob.id});
        span.setAttribute("job.id", dbJob.id);
        return dbJob.id;
    } catch (error) {
        await prisma.job.delete({where: {id: dbJob.id}});
        throw error;
    }
}

/**
 * Creates and returns the BullMQ worker for the `gamepile.game-details` queue.
 *
 * Each batch job is wrapped in an OpenTelemetry span with batch metadata attributes.
 *
 * @returns A configured BullMQ {@link Worker} instance for the game-details queue.
 */
function createDetailsWorker(): Worker<GameDetailsQueuePayload> {
    return new Worker<GameDetailsQueuePayload>(
        QUEUE_NAMES.GAME_DETAILS,
        async (job) =>
            tracer.startActiveSpan("job.FETCH_GAME_DETAILS_BATCH", async (span) => {
                span.setAttributes({
                    "job.type": "FETCH_GAME_DETAILS_BATCH",
                    "job.id": job.id ?? "",
                    "job.queue": QUEUE_NAMES.GAME_DETAILS,
                    "job.batchSize": job.data.appIds.length,
                    "job.parentJobId": job.data.parentJobId,
                    "worker.host": HOSTNAME,
                });

                try {
                    await handleFetchGameDetails(job);
                    span.setStatus({ code: SpanStatusCode.OK });
                } catch (error) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
                    span.recordException(error as Error);
                    throw error;
                } finally {
                    span.end();
                }
            }),
        {connection: redisOptions, concurrency: DETAILS_CONCURRENCY},
    )
        .on("error", (error) => log.error("Details worker encountered an error", error))
        .on("ready", () => log.info("Details worker is ready", {concurrency: DETAILS_CONCURRENCY}));
}

void initWorkers().catch((error) => {
    log.error("Failed to initialize workers", error instanceof Error ? error : undefined);
    process.exit(1);
});
