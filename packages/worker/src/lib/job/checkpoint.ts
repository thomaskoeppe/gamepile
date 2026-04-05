import { redis } from "@/src/lib/redis.js";

/** TTL for checkpoint data in Redis (24 hours). */
const CHECKPOINT_TTL_SECONDS = 24 * 60 * 60;

/**
 * Represents a pagination checkpoint for long-running sync jobs.
 *
 * Stored in Redis so that a job can resume from where it left off
 * after a crash or worker restart.
 */
export type SyncCheckpoint = {
    /** Opaque cursor value (e.g., last processed ID or appId). */
    cursor: string;
    /** Running total of items queued so far. */
    queuedItems: number;
};

/**
 * Generates the Redis key for a sync checkpoint.
 *
 * @param jobId - The parent job ID.
 * @returns The Redis key string.
 */
const redisKey = (jobId: string): string => `checkpoint:sync:${jobId}`;

/**
 * Reads the sync checkpoint for a given job from Redis.
 *
 * @param jobId - The parent job ID whose checkpoint to read.
 * @returns The deserialized checkpoint, or `null` if none exists.
 */
export async function readCheckpoint(jobId: string): Promise<SyncCheckpoint | null> {
    const raw = await redis.get(redisKey(jobId));
    if (!raw) return null;
    return JSON.parse(raw) as SyncCheckpoint;
}

/**
 * Writes (or overwrites) a sync checkpoint for a given job in Redis.
 *
 * The checkpoint is stored with a TTL of {@link CHECKPOINT_TTL_SECONDS}
 * so stale checkpoints are automatically cleaned up.
 *
 * @param jobId - The parent job ID.
 * @param data - The checkpoint data to persist.
 */
export async function writeCheckpoint(jobId: string, data: SyncCheckpoint): Promise<void> {
    await redis.set(redisKey(jobId), JSON.stringify(data), "EX", CHECKPOINT_TTL_SECONDS);
}

/**
 * Removes the sync checkpoint for a given job from Redis.
 *
 * Typically called after a job completes successfully.
 *
 * @param jobId - The parent job ID whose checkpoint to remove.
 */
export async function clearCheckpoint(jobId: string): Promise<void> {
    await redis.del(redisKey(jobId));
}