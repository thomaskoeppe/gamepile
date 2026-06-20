import { redis } from "@/src/lib/redis.js";

/** TTL for a cancellation flag in Redis (2 hours) — long enough to cover any
 * in-flight batch drain, short enough to self-clean. */
const CANCEL_TTL_SECONDS = 2 * 60 * 60;

/**
 * Generates the Redis key holding the cancellation flag for a parent job.
 *
 * @param jobId - The parent job ID.
 * @returns The Redis key string.
 */
const cancelKey = (jobId: string): string => `cancel:parent:${jobId}`;

/**
 * Checks whether a job has been flagged for cancellation.
 *
 * The flag is set by the web app (admin cancel action) or by the worker itself
 * when a job fails, so that long-running loops and in-flight child batches can
 * abort cooperatively at the next checkpoint.
 *
 * @param jobId - The parent job ID to check.
 * @returns `true` if the cancellation flag is set in Redis.
 */
export async function isJobCancelled(jobId: string): Promise<boolean> {
    return (await redis.get(cancelKey(jobId))) === "1";
}

/**
 * Sets the cancellation flag for a job so cooperating workers stop processing it.
 *
 * @param jobId - The parent job ID to flag.
 */
export async function flagJobCancelled(jobId: string): Promise<void> {
    await redis.set(cancelKey(jobId), "1", "EX", CANCEL_TTL_SECONDS);
}
