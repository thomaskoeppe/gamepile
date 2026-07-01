import { getWorkerEnv } from "@/src/lib/env.js";
import { isJobCancelled } from "@/src/lib/job/cancel.js";
import { tryCompleteParentJob } from "@/src/lib/job/completion.js";
import { createLog } from "@/src/lib/job/log.js";
import { achievementsQueue } from "@/src/lib/job/queue.js";
import { logger } from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";

/**
 * Imports a Steam user's achievements for every game in their library.
 *
 * Workflow:
 * 1. Resolves the user's Steam ID and their owned games (with Steam appIds).
 * 2. Enqueues batched child jobs on the achievements queue; each batch fetches
 *    the achievement schema and per-user unlocks per app.
 * 3. Evaluates parent job completion (children report progress/failures).
 *
 * @param payload - Import parameters.
 * @param payload.jobId - The database job ID tracking this import.
 * @param payload.userId - The internal user ID whose achievements are imported.
 * @throws {Error} If the user is not found or has no Steam ID.
 */
export default async function importUserAchievements(payload: {
    jobId: string;
    userId: string;
}): Promise<void> {
    const { jobId, userId } = payload;
    const log = logger.child("worker.jobs:importUserAchievements", { jobId, userId });
    const startMs = Date.now();
    const batchSize = getWorkerEnv().WORKER_ACHIEVEMENTS_BATCH_SIZE;

    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { id: true, steamId: true },
    });

    if (!user?.steamId) {
        throw new Error(`User ${userId} not found or has no steamId.`);
    }

    log.info("Starting achievements import", { steamId: user.steamId });

    const userGames = await prisma.userGame.findMany({
        where: { userId, game: { appId: { not: null } } },
        select: { game: { select: { id: true, appId: true } } },
    });

    await createLog(jobId, "info", `Importing achievements for ${userGames.length} owned game(s).`);

    if (userGames.length === 0) {
        await prisma.job.update({
            where: { id: jobId },
            data: { totalItems: 0, allItemsQueued: true },
        });
        await tryCompleteParentJob(jobId);
        log.info("No owned games — achievements import complete", { durationMs: Date.now() - startMs });
        return;
    }

    await prisma.job.update({
        where: { id: jobId },
        data: { totalItems: userGames.length, processedItems: 0 },
    });

    if (await isJobCancelled(jobId)) {
        log.info("Import canceled before queuing achievement batches");
        await createLog(jobId, "warn", "Import canceled before queuing achievement batches.");
        return;
    }

    const apps = userGames.map((ug) => ({ appId: ug.game.appId!, gameId: ug.game.id }));
    const childJobs: Parameters<typeof achievementsQueue.addBulk>[0] = [];

    for (let i = 0; i < apps.length; i += batchSize) {
        childJobs.push({
            name: "FETCH_USER_ACHIEVEMENTS_BATCH",
            data: {
                parentJobId: jobId,
                userId,
                steamId: user.steamId,
                apps: apps.slice(i, i + batchSize),
            },
            opts: {
                attempts: 4,
                backoff: { type: "exponential" as const, delay: 5_000 },
                removeOnComplete: 2_000,
                removeOnFail: 5_000,
            },
        });
    }

    await achievementsQueue.addBulk(childJobs);

    await prisma.job.update({
        where: { id: jobId },
        data: { allItemsQueued: true },
    });

    await tryCompleteParentJob(jobId);

    log.info("Achievement batches queued", {
        totalGames: apps.length,
        batches: childJobs.length,
        durationMs: Date.now() - startMs,
    });
}
