import IORedis from "ioredis";

export const redisOptions = {
    host: process.env.REDIS_HOST!,
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD ?? undefined,
    username: process.env.REDIS_USERNAME ?? undefined,
    maxRetriesPerRequest: null
};

export const redis = new IORedis(redisOptions);
