import { createRedisOptions } from "@gamepile/shared/redis";
import IORedis from "ioredis";

// lazyConnect keeps module evaluation free of network side effects. Next
// evaluates this module during `next build` page data collection, where Redis
// is not reachable (CI runs the build with no service container), and an eager
// client retries forever because BullMQ requires maxRetriesPerRequest: null —
// which floods the build log with ECONNREFUSED. Every consumer touches Redis
// inside a request, so connecting on the first command is soon enough.
export const redisOptions = { ...createRedisOptions(), lazyConnect: true };

export const redis = new IORedis(redisOptions);
