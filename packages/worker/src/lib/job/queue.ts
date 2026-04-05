import { Queue } from "bullmq";
import { JobType } from "@/src/prisma/generated/enums.js";
import { redisOptions } from "@/src/lib/redis.js";
import type { Priority } from "@/src/lib/job/priority.js";

/**
 * BullMQ queue name constants used across the worker.
 */
export const QUEUE_NAMES = {
    /** Main jobs queue — handles all top-level job types (sync, import, refresh, etc.). */
    JOBS:         "gamepile.jobs",
    /** Game details queue — handles batched detail-fetch child jobs. */
    GAME_DETAILS: "gamepile.game-details",
} as const;

/**
 * Payload shape for jobs on the main `gamepile.jobs` queue.
 */
export type JobsQueuePayload = {
    /** Optional user ID for user-scoped jobs (e.g., library import). */
    userId?: string;
    /** Optional database job ID — created lazily if not provided. */
    jobId?: string;
    /** The job type that determines which handler processes this job. */
    type: JobType;
    /** When `true`, indicates the job was enqueued by the internal scheduler. */
    internalScheduler?: boolean;
};

/**
 * Payload shape for child jobs on the `gamepile.game-details` queue.
 */
export type GameDetailsQueuePayload = {
    /** UUID of the parent job that spawned this batch. */
    parentJobId: string;
    /** Array of Steam appIds to fetch details for in this batch. */
    appIds:      number[];
    /** Mapping from Steam appId → internal Game UUID for efficient updates. */
    gameIdMap:   Record<number, string>;
    /** Priority level assigned to this batch. */
    priority:    Priority;
};

/**
 * BullMQ queue instance for the main jobs queue (`gamepile.jobs`).
 *
 * Used for enqueuing top-level jobs and registering scheduled repeatable jobs.
 */
export const jobsQueue = new Queue<JobsQueuePayload>(QUEUE_NAMES.JOBS, {
    connection: redisOptions,
});

/**
 * BullMQ queue instance for the game-details queue (`gamepile.game-details`).
 *
 * Used for enqueuing batched child jobs that fetch detailed game metadata
 * from the Steam Store API.
 */
export const gameDetailsQueue = new Queue<GameDetailsQueuePayload>(QUEUE_NAMES.GAME_DETAILS, {
    connection: redisOptions,
});