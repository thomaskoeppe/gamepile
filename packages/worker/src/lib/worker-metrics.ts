import { WORKER_METRICS, getWorkerInstanceId } from "@gamepile/shared/worker-metrics";

import { logger } from "@/src/lib/logger.js";
import { redis } from "@/src/lib/redis.js";

const log = logger.child("worker.lib:metrics");
let metricSequence = 0;

function buildMetricMember(prefix: string, now: number, suffix?: number): string {
    const sequence = suffix ?? ++metricSequence;
    return `${prefix}:${now}:${sequence}`;
}

/**
 * Publishes a heartbeat for the current worker instance to the Redis sorted set.
 *
 * The score is the current timestamp. Stale entries (older than the configured
 * online window) are automatically pruned as part of the same transaction.
 *
 * @param hostname - The hostname of the worker machine.
 * @param pid - The process ID of the worker.
 */
export async function publishWorkerHeartbeat(hostname: string, pid: number): Promise<void> {
    const now = Date.now();
    const staleBefore = now - WORKER_METRICS.workerOnlineWindowMs;
    const workerId = getWorkerInstanceId(hostname, pid);

    await redis
        .multi()
        .zadd(WORKER_METRICS.workersHeartbeatKey, now, workerId)
        .zremrangebyscore(WORKER_METRICS.workersHeartbeatKey, 0, staleBefore)
        .exec();
}

/**
 * Removes the heartbeat entry for a specific worker instance from Redis.
 *
 * Called during graceful shutdown so the worker is no longer listed as online.
 *
 * @param hostname - The hostname of the worker machine.
 * @param pid - The process ID of the worker.
 */
export async function removeWorkerHeartbeat(hostname: string, pid: number): Promise<void> {
    const workerId = getWorkerInstanceId(hostname, pid);
    await redis.zrem(WORKER_METRICS.workersHeartbeatKey, workerId);
}

/**
 * Records the completion of a game-details child job in a Redis sorted set.
 *
 * Used for throughput tracking and monitoring. Stale entries beyond the
 * retention window are pruned atomically. Failures to publish are logged
 * as warnings but do not propagate.
 *
 * @param jobId - Unique identifier of the completed detail job.
 */
export async function publishDetailJobCompletion(jobId: string): Promise<void> {
    const now = Date.now();
    const staleBefore = now - WORKER_METRICS.throughputRetentionWindowSeconds * 1_000;

    await redis
        .multi()
        .zadd(WORKER_METRICS.detailsJobsCompletedKey, now, `${jobId}:${now}`)
        .zremrangebyscore(WORKER_METRICS.detailsJobsCompletedKey, 0, staleBefore)
        .exec()
        .catch((error) => {
            log.warn("Failed to publish detail job completion metric", {
                jobId,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        });
}

/**
 * Records one outbound Steam API call for short-term throughput tracking.
 */
export async function publishSteamApiCall(): Promise<void> {
    const now = Date.now();
    const staleBefore = now - WORKER_METRICS.throughputRetentionWindowSeconds * 1_000;
    const member = buildMetricMember("steam-api", now);

    await redis
        .multi()
        .zadd(WORKER_METRICS.steamApiCallsKey, now, member)
        .zremrangebyscore(WORKER_METRICS.steamApiCallsKey, 0, staleBefore)
        .exec()
        .catch((error) => {
            log.warn("Failed to publish Steam API call metric", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
        });
}

/**
 * Records how many app IDs were fetched by a Steam API batch request.
 */
export async function publishSteamAppsFetched(count: number): Promise<void> {
    if (count <= 0) return;

    const now = Date.now();
    const staleBefore = now - WORKER_METRICS.throughputRetentionWindowSeconds * 1_000;
    const args: Array<string | number> = [];

    for (let i = 0; i < count; i++) {
        args.push(now, buildMetricMember("steam-app", now));
    }

    await redis
        .multi()
        .zadd(WORKER_METRICS.steamAppsFetchedKey, ...args)
        .zremrangebyscore(WORKER_METRICS.steamAppsFetchedKey, 0, staleBefore)
        .exec()
        .catch((error) => {
            log.warn("Failed to publish Steam apps fetched metric", {
                count,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        });
}

