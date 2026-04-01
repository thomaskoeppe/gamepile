import { createRedisOptions } from "@gamepile/shared/redis";
import IORedis from "ioredis";

export const redisOptions = createRedisOptions();

export const redis = new IORedis(redisOptions);
