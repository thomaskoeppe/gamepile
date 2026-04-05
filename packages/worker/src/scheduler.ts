import { JobStatus, JobType } from "@/src/prisma/generated/enums.js";

import { jobsQueue } from "@/src/lib/job/queue.js";
import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";
import { redis } from "@/src/lib/redis.js";
import prisma from "@/src/lib/prisma.js";

/**
 * Registers all recurring BullMQ job schedulers (cron-based repeatable jobs).
 *
 * Persists the desired scheduler configuration in Redis to detect mismatches
 * across multiple worker instances. Registers schedulers for:
 * - Steam tag sync
 * - Steam category sync
 * - Steam games catalog sync
 * - Game details refresh
 * - Internal scheduled tasks (daily housekeeping)
 *
 * @param hostname - The hostname of the worker registering the schedulers.
 */
export async function registerScheduledJobs(hostname: string): Promise<void> {
    const log = logger.child("worker.scheduler:register", { hostname });
    const env = getWorkerEnv();
    const syncCron = env.WORKER_SYNC_STEAM_GAMES_CRON;
    const refreshCron = env.WORKER_REFRESH_GAME_DETAILS_CRON;
    const tagsCron = env.WORKER_SYNC_STEAM_TAGS_CRON;
    const categoriesCron = env.WORKER_SYNC_STEAM_CATEGORIES_CRON;
    const internalScheduledTaskCron = "0 0 * * *";
    const schedulerConfigKey = "gamepile:worker:scheduler-config:v2";
    const desiredSchedulerConfig = JSON.stringify({ syncCron, refreshCron, tagsCron, categoriesCron });

    const wroteConfig = await redis.set(schedulerConfigKey, desiredSchedulerConfig, "NX");
    if (wroteConfig !== "OK") {
        const existingConfig = await redis.get(schedulerConfigKey);
        if (existingConfig !== desiredSchedulerConfig) {
            log.warn("Scheduler config mismatch across workers; proceeding with desired scheduler config", {
                existingConfig: existingConfig ?? "<missing>",
                desiredSchedulerConfig,
            });
            await redis.set(schedulerConfigKey, desiredSchedulerConfig);
        }
    }

    await jobsQueue.upsertJobScheduler(
        "gamepile.schedule.sync-steam-tags",
        { pattern: tagsCron },
        {
            name: JobType.SYNC_STEAM_TAGS,
            data: { type: JobType.SYNC_STEAM_TAGS },
        },
    );

    await jobsQueue.upsertJobScheduler(
        "gamepile.schedule.sync-steam-categories",
        { pattern: categoriesCron },
        {
            name: JobType.SYNC_STEAM_CATEGORIES,
            data: { type: JobType.SYNC_STEAM_CATEGORIES },
        },
    );

    await jobsQueue.upsertJobScheduler(
        "gamepile.schedule.sync-steam-games",
        { pattern: syncCron },
        {
            name: JobType.SYNC_STEAM_GAMES,
            data: { type: JobType.SYNC_STEAM_GAMES },
        },
    );

    await jobsQueue.upsertJobScheduler(
        "gamepile.schedule.refresh-game-details",
        { pattern: refreshCron },
        {
            name: JobType.REFRESH_GAME_DETAILS,
            data: { type: JobType.REFRESH_GAME_DETAILS },
        },
    );

    await jobsQueue.upsertJobScheduler(
        "gamepile.schedule.internal-scheduled-task",
        { pattern: internalScheduledTaskCron },
        {
            name: JobType.INTERNAL_SCHEDULED_TASK,
            data: { type: JobType.INTERNAL_SCHEDULED_TASK, internalScheduler: true },
        },
    );

    log.info("Scheduled jobs registered", {
        scheduledJobs: [
            { name: "SYNC_STEAM_TAGS", cron: tagsCron },
            { name: "SYNC_STEAM_CATEGORIES", cron: categoriesCron },
            { name: "SYNC_STEAM_GAMES", cron: syncCron },
            { name: "REFRESH_GAME_DETAILS", cron: refreshCron },
            { name: "INTERNAL_SCHEDULED_TASK", cron: internalScheduledTaskCron },
        ],
    });
}

/**
 * Ensures an initial `SYNC_STEAM_GAMES` job exists on first boot.
 *
 * If no sync job has ever been created (in any status), creates one and
 * enqueues it on the jobs queue. This seeds the game catalog on fresh
 * installations.
 *
 * @param hostname - The hostname of the worker performing the check.
 */
export async function ensureInitialSyncQueued(hostname: string): Promise<void> {
    const log = logger.child("worker.scheduler:initialSync", { hostname });

    const hasAnySync = await prisma.job.findFirst({
        where: {
            type: JobType.SYNC_STEAM_GAMES,
            status: {
                in: [JobStatus.ACTIVE, JobStatus.QUEUED, JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED],
            },
        },
        select: { id: true },
    });

    if (hasAnySync) {
        log.info("Initial sync already exists — skipping first-boot seed");
        return;
    }

    const dbJob = await prisma.job.create({
        data: { type: JobType.SYNC_STEAM_GAMES },
    });

    await jobsQueue.add(JobType.SYNC_STEAM_GAMES, {
        jobId: dbJob.id,
        type: JobType.SYNC_STEAM_GAMES,
    });

    log.info("Initial sync job queued", { jobId: dbJob.id });
}
