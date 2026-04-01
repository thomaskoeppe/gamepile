import {Queue} from "bullmq";
import {redisOptions} from "@/src/lib/redis.js";
import {JobType} from "@/src/prisma/generated/enums.js";
import {Priority} from "@/src/lib/job/priority.js";

export const QUEUE_NAMES = {
    JOBS:         "gamepile.jobs",
    GAME_DETAILS: "gamepile.game-details",
} as const;

export type JobsQueuePayload = {
    userId?: string;
    jobId?: string;
    type: JobType;
    internalScheduler?: boolean;
}

export type GameDetailsQueuePayload = {
    parentJobId: string;
    appId:       number;
    gameId:      string;
    priority:    Priority;
};

export const jobsQueue = new Queue<JobsQueuePayload>(QUEUE_NAMES.JOBS, {
    connection: redisOptions,
});

export const gameDetailsQueue = new Queue<GameDetailsQueuePayload>(QUEUE_NAMES.GAME_DETAILS, {
    connection: redisOptions,
});