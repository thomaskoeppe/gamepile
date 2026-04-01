import { JobStatus, JobType } from "@/src/prisma/generated/enums.js";

import { jobsQueue } from "@/src/lib/job/queue.js";
import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";
import { redis } from "@/src/lib/redis.js";
import prisma from "@/src/lib/prisma.js";

export async function registerScheduledJobs(hostname: string): Promise<void> {
    const log = logger.child("worker.scheduler:register", { hostname });
    const env = getWorkerEnv();
    const syncCron = env.WORKER_SYNC_STEAM_GAMES_CRON;
    const refreshCron = env.WORKER_REFRESH_GAME_DETAILS_CRON;
    const internalScheduledTaskCron = "0 * * * *";
    const schedulerConfigKey = "gamepile:worker:scheduler-config:v1";
    const desiredSchedulerConfig = JSON.stringify({ syncCron, refreshCron });

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
            { name: "SYNC_STEAM_GAMES", cron: syncCron },
            { name: "REFRESH_GAME_DETAILS", cron: refreshCron },
            { name: "INTERNAL_SCHEDULED_TASK", cron: internalScheduledTaskCron },
        ],
    });
}

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

