import {clearCheckpoint, readCheckpoint, writeCheckpoint} from "@/src/lib/job/checkpoint.js";
import {tryCompleteParentJob} from "@/src/lib/job/completion.js";
import {createLog} from "@/src/lib/job/log.js";
import {PRIORITY} from "@/src/lib/job/priority.js";
import {gameDetailsQueue} from "@/src/lib/job/queue.js";
import {getWorkerEnv} from "@/src/lib/env.js";
import {getConnectedGameIds, upsertGameStubs} from "@/src/lib/helper.js";
import {logger} from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";
import {getAppList} from "@/src/lib/steam/api/get-app-list.js";

/** Maximum number of apps to request per Steam GetAppList page. */
const MAX_RESULTS_PER_PAGE = 50_000;

/**
 * Synchronizes the local game catalog with the full Steam application list.
 *
 * Workflow:
 * 1. Paginates through the Steam IStoreService/GetAppList API.
 * 2. Upserts minimal game stubs for each page of results.
 * 3. Identifies games that need detail refreshing (modified since last fetch).
 * 4. Splits eligible games into priority tiers (connected games get higher priority).
 * 5. Enqueues batched detail-fetch child jobs on the game-details queue.
 * 6. Checkpoints progress so the job can resume after interruption.
 *
 * Supports incremental mode via `ifModifiedSince` (fetches only recently changed apps)
 * and full mode when no previous sync exists.
 *
 * @param opts - Sync configuration.
 * @param opts.jobId - The database job ID tracking this sync run.
 * @param opts.ifModifiedSince - Unix timestamp for incremental sync, or `undefined` for full sync.
 * @param opts.ignoreLastModified - When `true`, forces re-fetching details for all apps regardless of timestamps.
 */
export default async function syncSteamGames(opts: {
    jobId: string;
    ifModifiedSince?: number;
    ignoreLastModified?: boolean;
}): Promise<void> {
    const { jobId, ifModifiedSince, ignoreLastModified } = opts;
    const log = logger.child("worker.jobs:syncSteamGames", { jobId });
    const startMs = Date.now();
    const steamApiKey = getWorkerEnv().STEAM_API_KEY;
    const batchSize = getWorkerEnv().WORKER_DETAILS_BATCH_SIZE;

    const checkpoint = await readCheckpoint(jobId);
    let lastAppId = checkpoint ? Number(checkpoint.cursor) : 0;
    let totalQueued = checkpoint?.queuedItems ?? 0;

    log.info("Starting Steam games sync", {ifModifiedSince, ignoreLastModified, checkpoint});

    if (checkpoint) {
        await createLog(jobId, "info",
            `Resuming from checkpoint: cursor=${lastAppId}, alreadyQueued=${totalQueued}.`,
        );
    }

    let hasMorePages = true;

    while (hasMorePages) {
        const page = await getAppList({
            key: steamApiKey,
            includeGames: true,
            includeDlc: true,
            maxResults: MAX_RESULTS_PER_PAGE,
            lastAppId,
            ifModifiedSince,
            ignoreLastModified,
        });

        hasMorePages = page.haveMoreResults;
        lastAppId = page.lastAppId;

        if (page.apps.length === 0) break;

        await upsertGameStubs(
            page.apps.map((a) => ({
                appId: a.appid,
                name: a.name,
                steamLastModified: a.last_modified,
            })),
        );

        const appIds = page.apps.map((a) => a.appid);

        const existingGames = await prisma.game.findMany({
            where: { appId: { in: appIds } },
            select: {id: true, appId: true, steamLastModified: true, detailsFetchedAt: true},
        });

        const existingByAppId = new Map(existingGames.map((g) => [g.appId!, g]));

        const appsNeedingUpdate = page.apps.filter((app) => {
            if (ignoreLastModified) return true;
            const game = existingByAppId.get(app.appid);
            if (!game || !game.detailsFetchedAt) return true;
            return app.last_modified > game.detailsFetchedAt.getTime() / 1_000;
        });

        if (appsNeedingUpdate.length === 0) {
            log.debug("All apps in this page are current — skipping", {lastAppId});
            await writeCheckpoint(jobId, { cursor: lastAppId.toString(), queuedItems: totalQueued });
            continue;
        }

        const gameIdByAppId = new Map(
            existingGames
                .filter((g): g is typeof g & { appId: number } => g.appId !== null)
                .map((g) => [g.appId, g.id]),
        );

        const eligibleGames = appsNeedingUpdate
            .map((app) => {
                const gameId = gameIdByAppId.get(app.appid);
                if (!gameId) {
                    log.warn("No Game row after upsert — skipping", {appId: app.appid});
                    return null;
                }
                return { appId: app.appid, gameId };
            })
            .filter((g): g is NonNullable<typeof g> => g !== null);

        const allGameIds = eligibleGames.map((g) => g.gameId);
        const connectedIds = await getConnectedGameIds(allGameIds);

        log.debug("Priority split for page", {
            high: eligibleGames.filter((g) => connectedIds.has(g.gameId)).length,
            low: eligibleGames.length - eligibleGames.filter((g) => connectedIds.has(g.gameId)).length,
            total: eligibleGames.length,
        });

        const childJobs: Parameters<typeof gameDetailsQueue.addBulk>[0] = [];
        let totalAppsInBatch = 0;

        for (let i = 0; i < eligibleGames.length; i += batchSize) {
            const chunk = eligibleGames.slice(i, i + batchSize);
            const chunkAppIds = chunk.map((g) => g.appId);
            const gameIdMap: Record<number, string> = {};
            let hasHighPriority = false;

            for (const g of chunk) {
                gameIdMap[g.appId] = g.gameId;
                if (connectedIds.has(g.gameId)) hasHighPriority = true;
            }

            const priority = hasHighPriority ? PRIORITY.NORMAL : PRIORITY.LOW;

            childJobs.push({
                name: "FETCH_GAME_DETAILS_BATCH",
                data: {parentJobId: jobId, appIds: chunkAppIds, gameIdMap, priority},
                opts: {
                    priority,
                    attempts:         6,
                    backoff:          { type: "exponential" as const, delay: 2_000 },
                    removeOnComplete: 2_000,
                    removeOnFail:     5_000,
                },
            });

            totalAppsInBatch += chunkAppIds.length;
        }

        await gameDetailsQueue.addBulk(childJobs);
        totalQueued += totalAppsInBatch;

        await prisma.job.update({
            where: { id: jobId },
            data: {totalItems: {increment: totalAppsInBatch}},
        });

        await writeCheckpoint(jobId, {cursor: lastAppId.toString(), queuedItems: totalQueued});

        log.info("Page committed", {
            batchJobsQueued: childJobs.length,
            appsQueued: totalAppsInBatch,
            runningTotal: totalQueued,
        });
    }

    await prisma.job.update({
        where: { id: jobId },
        data: {allItemsQueued: true},
    });

    await createLog(jobId, "info",
        `Pagination complete. ${totalQueued} app(s) queued across all pages.`,
    );

    await tryCompleteParentJob(jobId);
    await clearCheckpoint(jobId);

    log.info("Steam games sync completed", {totalQueued, durationMs: Date.now() - startMs});
}
