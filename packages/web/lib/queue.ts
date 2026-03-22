import 'server-only';

import { Queue } from "bullmq";

import { redisOptions } from "@/lib/redis";
import { JobType } from "@/prisma/generated/enums";

const QUEUE_NAMES = {
    JOBS:         "gamepile.jobs",
    GAME_DETAILS: "gamepile.game-details",
} as const;

type JobsQueuePayload = {
    jobId?:  string;
    userId?: string;
    type:    JobType;
};

export const jobsQueue = new Queue<JobsQueuePayload>(QUEUE_NAMES.JOBS, {
    connection: redisOptions,
});