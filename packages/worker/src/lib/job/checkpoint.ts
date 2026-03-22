import { redis } from "@/src/lib/redis.js";

const CHECKPOINT_TTL_SECONDS = 24 * 60 * 60;

export type SyncCheckpoint = {
    cursor: string;
    queuedItems: number;
};

const redisKey = (jobId: string): string => `checkpoint:sync:${jobId}`;

/** Reads a sync checkpoint from Redis, or returns `null` if none exists. */
export async function readCheckpoint(jobId: string): Promise<SyncCheckpoint | null> {
    const raw = await redis.get(redisKey(jobId));
    if (!raw) return null;
    return JSON.parse(raw) as SyncCheckpoint;
}

/** Persists a sync checkpoint to Redis with a 24-hour TTL. */
export async function writeCheckpoint(jobId: string, data: SyncCheckpoint): Promise<void> {
    await redis.set(redisKey(jobId), JSON.stringify(data), "EX", CHECKPOINT_TTL_SECONDS);
}

/** Removes a sync checkpoint from Redis. */
export async function clearCheckpoint(jobId: string): Promise<void> {
    await redis.del(redisKey(jobId));
}