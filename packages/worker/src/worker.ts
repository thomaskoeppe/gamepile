import * as os from "node:os";
import { setInterval } from "node:timers";

import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";

import { handleDetailsJob } from "@/src/handlers/details-handler.js";
import { handleJobByType } from "@/src/handlers/jobs-handler.js";
import { getWorkerEnv } from "@/src/lib/env.js";
import { createLog } from "@/src/lib/job/log.js";
import {
    type GameDetailsQueuePayload,
    gameDetailsQueue,
    type JobsQueuePayload,
    jobsQueue,
    QUEUE_NAMES,
} from "@/src/lib/job/queue.js";
import { flushLogs, logger } from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";
import { redis, redisOptions } from "@/src/lib/redis.js";
import { JobStatus } from "@/src/prisma/generated/enums.js";
import { recoverStaleJobs } from "@/src/recovery.js";
import { ensureInitialSyncQueued, registerScheduledJobs } from "@/src/scheduler.js";

const log = logger.child("worker");
const tracer = trace.getTracer("gamepile-worker");
const HOSTNAME = os.hostname();
const env = getWorkerEnv();

const JOBS_CONCURRENCY = env.WORKER_JOBS_CONCURRENCY;
const DETAILS_CONCURRENCY = env.WORKER_DETAILS_CONCURRENCY;
const STARTUP_DELAY_MS = env.WORKER_STARTUP_DELAY_MS;
const STALE_ACTIVE_RECOVERY_DELAY_MS = env.WORKER_STALE_ACTIVE_RECOVERY_DELAY_MS;
const ACTIVE_RECOVERY_LOCK_TTL_MS = env.WORKER_ACTIVE_RECOVERY_LOCK_TTL_MS;
const IMPORT_USER_LIBRARY_INTERVAL_MS = env.WORKER_IMPORT_USER_LIBRARY_INTERVAL_MS;

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
        if (statusInterval) clearInterval(statusInterval);

        await Promise.all([
            jobsWorker ? jobsWorker.close() : Promise.resolve(),
            detailsWorker ? detailsWorker.close() : Promise.resolve(),
        ]);

        await Promise.all([prisma.$disconnect(), redis.quit()]);
        log.info("Worker shutdown complete. Exiting process", { hostname: HOSTNAME });
        await flushLogs();
        process.exit(0);
    } catch (error) {
        log.error("Error during worker shutdown", error as Error);
        await flushLogs();
        process.exit(1);
    }
}

function startStatusInterval() {
    statusInterval = setInterval(async () => {
        const [
            detailsJobsActive,
            detailsJobsDelayed,
            detailsJobsWaiting,
            detailsJobsFailed,
            detailsJobsCompleted,
            detailsJobsPriorityCounts,
        ] = await Promise.all([
            gameDetailsQueue.getActiveCount(),
            gameDetailsQueue.getDelayedCount(),
            gameDetailsQueue.getWaitingCount(),
            gameDetailsQueue.getFailedCount(),
            gameDetailsQueue.getCompletedCount(),
            gameDetailsQueue.getCountsPerPriority([...Array(10).keys()]),
        ]);

        const [
            mainWorkerJobsActive,
            mainWorkerJobsDelayed,
            mainWorkerJobsWaiting,
            mainWorkerJobsFailed,
            mainWorkerJobsCompleted,
            mainWorkerJobsPriorityCounts,
        ] = await Promise.all([
            jobsQueue.getActiveCount(),
            jobsQueue.getDelayedCount(),
            jobsQueue.getWaitingCount(),
            jobsQueue.getFailedCount(),
            jobsQueue.getCompletedCount(),
            jobsQueue.getCountsPerPriority([...Array(10).keys()]),
        ]);

        log.info("Worker status update", {
            gameDetailsQueue: {
                active: detailsJobsActive,
                delayed: detailsJobsDelayed,
                waiting: detailsJobsWaiting,
                failed: detailsJobsFailed,
                completed: detailsJobsCompleted,
                priority: Object.fromEntries(Object.entries(detailsJobsPriorityCounts).filter(([, count]) => count > 0)),
            },
            mainQueue: {
                active: mainWorkerJobsActive,
                delayed: mainWorkerJobsDelayed,
                waiting: mainWorkerJobsWaiting,
                failed: mainWorkerJobsFailed,
                completed: mainWorkerJobsCompleted,
                priority: Object.fromEntries(Object.entries(mainWorkerJobsPriorityCounts).filter(([, count]) => count > 0)),
            },
            hostname: HOSTNAME,
        });
    }, 2 * 60 * 1_000);
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
        log.info("Worker startup delay in effect", { hostname: HOSTNAME, delayMs: STARTUP_DELAY_MS });
        await new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY_MS));
    }

    await recoverStaleJobs({
        hostname: HOSTNAME,
        staleActiveRecoveryDelayMs: STALE_ACTIVE_RECOVERY_DELAY_MS,
        activeRecoveryLockTtlMs: ACTIVE_RECOVERY_LOCK_TTL_MS,
    }).catch((error) => log.error("Stale job recovery failed (non-fatal)", error as Error));

    await registerScheduledJobs(HOSTNAME);

    await ensureInitialSyncQueued(HOSTNAME).catch((error) =>
        log.error("First-boot sync check failed (non-fatal)", error as Error),
    );

    jobsWorker = new Worker<JobsQueuePayload>(
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
                    if (!jobId) {
                        const dbJob = await prisma.job.create({
                            data: { type, userId: userId ?? null },
                        });

                        try {
                            jobId = dbJob.id;
                            await job.updateData({ ...job.data, jobId });
                            span.setAttribute("job.id", jobId);
                        } catch (error) {
                            await prisma.job.delete({ where: { id: dbJob.id } });
                            throw error;
                        }
                    }

                    const resolvedJobId = jobId!;

                    await prisma.job.update({
                        where: { id: resolvedJobId },
                        data: { status: JobStatus.ACTIVE, startedAt: new Date(), claimedBy: HOSTNAME },
                    });

                    await createLog(resolvedJobId, "info", "Worker picked up job");

                    await handleJobByType({
                        type,
                        userId,
                        internalScheduler,
                        resolvedJobId,
                        importUserLibraryIntervalMs: IMPORT_USER_LIBRARY_INTERVAL_MS,
                    });

                    span.setStatus({ code: SpanStatusCode.OK });
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Unknown error";
                    const resolvedJobId = jobId!;

                    span.setStatus({ code: SpanStatusCode.ERROR, message });
                    span.recordException(error as Error);

                    log.error("Job failed", error instanceof Error ? error : undefined, {
                        jobId: resolvedJobId,
                        type,
                    });

                    await prisma.job.update({
                        where: { id: resolvedJobId },
                        data: { status: JobStatus.FAILED, finishedAt: new Date(), errorMessage: message },
                    });

                    await redis.set(`cancel:parent:${resolvedJobId}`, "1", "EX", 2 * 60 * 60);
                    await createLog(resolvedJobId, "error", `Job failed: ${message}`);
                    throw error;
                } finally {
                    span.end();
                }
            });
        },
        {
            connection: redisOptions,
            concurrency: JOBS_CONCURRENCY,
        },
    )
        .on("error", (error) => log.error("Jobs worker encountered an error", error))
        .on("ready", () => {
            log.info("Jobs worker is ready and waiting for jobs", {
                ips: Object.values(os.networkInterfaces())
                    .flat()
                    .filter((iface): iface is os.NetworkInterfaceInfo => !!iface && iface.family === "IPv4" && !iface.internal)
                    .map((iface) => iface.address),
                hostname: HOSTNAME,
                concurrency: JOBS_CONCURRENCY,
            });
        });

    detailsWorker = new Worker<GameDetailsQueuePayload>(
        QUEUE_NAMES.GAME_DETAILS,
        async (job) =>
            tracer.startActiveSpan("job.FETCH_GAME_DETAILS", async (span) => {
                span.setAttributes({
                    "job.type": "FETCH_GAME_DETAILS",
                    "job.id": job.id ?? "",
                    "job.queue": QUEUE_NAMES.GAME_DETAILS,
                    "job.appId": job.data.appId,
                    "job.parentJobId": job.data.parentJobId,
                    "worker.host": HOSTNAME,
                });

                try {
                    await handleDetailsJob(job);
                    span.setStatus({ code: SpanStatusCode.OK });
                } catch (error) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
                    span.recordException(error as Error);
                    throw error;
                } finally {
                    span.end();
                }
            }),
        {
            connection: redisOptions,
            concurrency: DETAILS_CONCURRENCY,
        },
    )
        .on("error", (error) => log.error("Details worker encountered an error", error))
        .on("ready", () => {
            log.info("Details worker is ready and waiting for jobs", {
                ips: Object.values(os.networkInterfaces())
                    .flat()
                    .filter((iface): iface is os.NetworkInterfaceInfo => !!iface && iface.family === "IPv4" && !iface.internal)
                    .map((iface) => iface.address),
                hostname: HOSTNAME,
                concurrency: DETAILS_CONCURRENCY,
            });
        });

    startStatusInterval();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));


void initWorkers().catch((error) => {
    log.error("Failed to initialize workers", error instanceof Error ? error : undefined);
    process.exit(1);
});

