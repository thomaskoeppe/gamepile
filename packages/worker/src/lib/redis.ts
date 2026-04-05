import { Redis } from "ioredis";
import { createRedisOptions } from "@gamepile/shared/redis";

import { getWorkerEnv } from "@/src/lib/env.js";

const env = getWorkerEnv();

/**
 * Redis connection options derived from the validated worker environment variables.
 *
 * Reused by BullMQ queues, workers, and any direct Redis operations.
 */
export const redisOptions = createRedisOptions({
	REDIS_HOST: env.REDIS_HOST,
	REDIS_PORT: String(env.REDIS_PORT),
	REDIS_PASSWORD: env.REDIS_PASSWORD,
	REDIS_USERNAME: env.REDIS_USERNAME,
});

/**
 * Shared ioredis client instance for the worker process.
 *
 * Used for rate limiting, checkpoints, cancellation flags, heartbeats,
 * and other direct Redis operations. BullMQ workers receive their own
 * connections via {@link redisOptions}.
 */
export const redis = new Redis(redisOptions);