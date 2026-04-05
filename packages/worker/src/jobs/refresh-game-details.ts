import { clearCheckpoint, readCheckpoint, writeCheckpoint } from "@/src/lib/job/checkpoint.js";
import { tryCompleteParentJob } from "@/src/lib/job/completion.js";
import { createLog } from "@/src/lib/job/log.js";
import { PRIORITY } from "@/src/lib/job/priority.js";
import { gameDetailsQueue } from "@/src/lib/job/queue.js";
import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";

/** Number of games to query per cursor-based pagination page. */
const PAGE_SIZE = 500;

/**
 * Refreshes game details for all games in the catalog that are "connected"
 * (referenced by a user library, collection, or key vault) and have stale
 * or missing details.
 *
 * Paginates through the eligible games using cursor-based pagination,
 * enqueuing batched detail-fetch child jobs at `NORMAL` priority. Supports
 * checkpointing so the job can resume after a crash or restart.
 *
 * @param opts - Job options.
 * @param opts.jobId - The database job ID tracking this refresh run.
 */
export default async function refreshGameDetails(opts: { jobId: string }): Promise<void> {
    const { jobId } = opts;
    const log = logger.child("worker.jobs:refreshGameDetails", { jobId });
    const startMs = Date.now();

    const env = getWorkerEnv();
    const staleAfterDays = env.WORKER_GAME_DETAILS_REFRESH_DAYS;
    const batchSize = env.WORKER_DETAILS_BATCH_SIZE;
    const staleThreshold = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1_000);

    const checkpoint = await readCheckpoint(jobId);
    let cursor:      string | null = checkpoint?.cursor      ?? null;
    let totalQueued: number        = checkpoint?.queuedItems ?? 0;

    if (checkpoint) {
        await createLog(jobId, "info",
            `Resuming refresh from checkpoint. alreadyQueued=${totalQueued}.`,
        );
    }

    await createLog(jobId, "info",
        `Refreshing details for games in libraries, collections, or vaults with detailsFetchedAt < ${staleThreshold.toISOString()} ` +
        `(or never fetched). Threshold: ${staleAfterDays} days.`,
    );

    let hasMore = true;

    while (hasMore) {
        const games = await prisma.game.findMany({
            where: {
                appId: { not: null },
                OR: [
                    { detailsFetchedAt: null, userGames:       { some: {} } },
                    { detailsFetchedAt: null, collectionGames: { some: {} } },
                    { detailsFetchedAt: null, keyVaultGames:   { some: {} } },
                    { detailsFetchedAt: { lt: staleThreshold }, userGames:       { some: {} } },
                    { detailsFetchedAt: { lt: staleThreshold }, collectionGames: { some: {} } },
                    { detailsFetchedAt: { lt: staleThreshold }, keyVaultGames:   { some: {} } },
                ],
            },
            cursor:  cursor ? { id: cursor } : undefined,
            skip:    cursor ? 1 : 0,
            take:    PAGE_SIZE,
            select:  { id: true, appId: true },
            orderBy: { id: "asc" },
        });

        if (games.length === 0) {
            hasMore = false;
            break;
        }

        hasMore = games.length === PAGE_SIZE;
        cursor  = games[games.length - 1].id;

        const validGames = games.filter((g): g is typeof g & { appId: number } => g.appId !== null);

        await prisma.job.update({
            where: { id: jobId },
            data:  { totalItems: { increment: validGames.length } },
        });

        const childJobs: Parameters<typeof gameDetailsQueue.addBulk>[0] = [];

        for (let i = 0; i < validGames.length; i += batchSize) {
            const chunk = validGames.slice(i, i + batchSize);
            const chunkAppIds = chunk.map((g) => g.appId);
            const gameIdMap: Record<number, string> = {};

            for (const g of chunk) {
                gameIdMap[g.appId] = g.id;
            }

            childJobs.push({
                name: "FETCH_GAME_DETAILS_BATCH",
                data: { parentJobId: jobId, appIds: chunkAppIds, gameIdMap, priority: PRIORITY.NORMAL },
                opts: {
                    attempts:         6,
                    backoff:          { type: "exponential" as const, delay: 2_000 },
                    removeOnComplete: 2_000,
                    removeOnFail:     5_000,
                    priority:         PRIORITY.NORMAL,
                },
            });
        }

        if (childJobs.length > 0) {
            await gameDetailsQueue.addBulk(childJobs);
            totalQueued += validGames.length;
        }

        await writeCheckpoint(jobId, { cursor, queuedItems: totalQueued });

        log.info("Queued stale games for refresh", {
            batchJobsQueued: childJobs.length,
            appsQueued: validGames.length,
            runningTotal: totalQueued,
            cursor,
        });
    }

    await prisma.job.update({
        where: { id: jobId },
        data: { allItemsQueued: true },
    });

    await createLog(jobId, "info",
        `Refresh pagination complete. ${totalQueued} game(s) queued for detail update.`,
    );

    await tryCompleteParentJob(jobId);
    await clearCheckpoint(jobId);

    log.info("Refresh game details job completed", { totalQueued, durationMs: Date.now() - startMs });
}