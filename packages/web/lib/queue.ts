import "server-only";

import { Queue } from "bullmq";

import { redisOptions } from "@/lib/redis";
import { JobType } from "@/prisma/generated/enums";

const QUEUE_NAMES = {
    JOBS: "gamepile.jobs",
    GAME_DETAILS: "gamepile.game-details",
} as const;

type JobsQueuePayload = {
    jobId?: string;
    userId?: string;
    type: JobType;
};

let jobsQueueInstance: Queue<JobsQueuePayload> | undefined;

/**
 * Returns the shared jobs queue, constructing it on first use.
 *
 * Deliberately not a module-scope `new Queue(...)`: BullMQ's constructor
 * connects immediately (RedisConnection.init awaits waitUntilReady, and
 * skipWaitingForReady still issues an INFO for the version check), so building
 * it at import time opens a Redis socket during `next build` page data
 * collection, where Redis is unreachable. Enqueueing only ever happens inside a
 * request, by which point the connection is live.
 */
export function getJobsQueue(): Queue<JobsQueuePayload> {
    jobsQueueInstance ??= new Queue<JobsQueuePayload>(QUEUE_NAMES.JOBS, {
        connection: redisOptions,
    });

    return jobsQueueInstance;
}
