import { Redis } from "ioredis";
import { createRedisOptions } from "@gamepile/shared/redis";

import { getWorkerEnv } from "@/src/lib/env.js";

const env = getWorkerEnv();

export const redisOptions = createRedisOptions({
	REDIS_HOST: env.REDIS_HOST,
	REDIS_PORT: String(env.REDIS_PORT),
	REDIS_PASSWORD: env.REDIS_PASSWORD,
	REDIS_USERNAME: env.REDIS_USERNAME,
} as NodeJS.ProcessEnv);

export const redis = new Redis(redisOptions);