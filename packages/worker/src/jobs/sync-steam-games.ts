import prisma from "@/src/lib/prisma.js";
import {logger} from "@/src/lib/logger.js";
import {clearCheckpoint, readCheckpoint, writeCheckpoint} from "@/src/lib/job/checkpoint.js";
import {createLog} from "@/src/lib/job/log.js";
import {getAppList} from "@/src/lib/steam/store-service/get-app-list.js";
import {gameDetailsQueue} from "@/src/lib/job/queue.js";
import {tryCompleteParentJob} from "@/src/lib/job/completion.js";
import {getConnectedGameIds, upsertGameStubs} from "@/src/lib/helper.js";
import {PRIORITY} from "@/src/lib/job/priority.js";
import { getWorkerEnv } from "@/src/lib/env.js";

const MAX_RESULTS_PER_PAGE = 50_000;

export default async function job(opts: { ifModifiedSince?: number; ignoreLastModified?: boolean; jobId: string; }) {
    const { jobId, ifModifiedSince, ignoreLastModified } = opts;
    const log = logger.child("worker.jobs:syncSteamGames", { jobId });
    const start = Date.now();
    const checkpoint = await readCheckpoint(jobId);
    const steamApiKey = getWorkerEnv().STEAM_API_KEY;

    let lastAppId = checkpoint ? Number(checkpoint.cursor) : 0;
    let totalQueued = checkpoint?.queuedItems ?? 0;

    log.info("Starting Steam games sync", {
        ifModifiedSince,
        ignoreLastModified,
        checkpoint,
    });

    if (checkpoint) {
        await createLog(
            jobId, "info",
            `Resuming from checkpoint: cursor=${lastAppId}, alreadyQueued=${totalQueued}.`
        );
    }

    let haveMoreResults = true;

    while (haveMoreResults) {
        const data = await getAppList({
            key: steamApiKey,
            includeGames: true,
            includeDlc: true,
            maxResults: MAX_RESULTS_PER_PAGE,
            lastAppId,
            ifModifiedSince,
            ignoreLastModified
        });

        haveMoreResults = data.haveMoreResults;
        lastAppId = data.lastAppId;

        if (data.apps.length === 0) break;

        await upsertGameStubs(
            data.apps.map((a) => ({
                appId: a.appid,
                name: a.name,
                steamLastModified: a.last_modified,
            }))
        );

        const apps = data.apps;
        const appIds = apps.map((a) => a.appid);

        const existingGames = await prisma.game.findMany({
            where: { appId: { in: appIds } },
            select: { id: true, appId: true, updatedAt: true, steamLastModified: true, detailsFetchedAt: true },
        });

        const existingByAppId = new Map(existingGames.map((g) => [g.appId!, g]));

        const appsNeedingUpdate = apps.filter((app) => {
            if (ignoreLastModified) return true;
            const game = existingByAppId.get(app.appid);
            if (!game) return true;
            if (!game.detailsFetchedAt) return true;
            return app.last_modified > game.detailsFetchedAt.getTime() / 1_000;
        });

        if (appsNeedingUpdate.length === 0) {
            log.info("All apps in this page are current. Saving cursor and continuing.");
            await writeCheckpoint(jobId, { cursor: lastAppId.toString(), queuedItems: totalQueued });
            continue;
        }

        const gameIdByAppId = new Map(
            existingGames
                .filter((g): g is typeof g & { appId: number } => g.appId !== null)
                .map((g) => [g.appId, g.id])
        );

        const eligibleGames = appsNeedingUpdate
            .map((app) => {
                const gameId = gameIdByAppId.get(app.appid);
                if (!gameId) {
                    log.warn(`No Game row for appId=${app.appid} after upsert — skipping.`);
                    return null;
                }
                return { appId: app.appid, gameId };
            })
            .filter((g): g is NonNullable<typeof g> => g !== null);

        const allGameIds    = eligibleGames.map((g) => g.gameId);
        const connectedIds  = await getConnectedGameIds(allGameIds);

        const highCount = eligibleGames.filter((g) => connectedIds.has(g.gameId)).length;
        const lowCount  = eligibleGames.length - highCount;

        log.info(`Priority split: ${highCount} high, ${lowCount} low out of ${eligibleGames.length} games.`);

        const childJobs = eligibleGames.map((g) => {
            const priority = connectedIds.has(g.gameId) ? PRIORITY.NORMAL : PRIORITY.LOW;

            return {
                name: "FETCH_GAME_DETAILS",
                data: { parentJobId: jobId, appId: g.appId, gameId: g.gameId, priority },
                opts: {
                    priority,
                    attempts:         6,
                    backoff:          { type: "exponential" as const, delay: 2_000 },
                    removeOnComplete: 2_000,
                    removeOnFail:     5_000,
                },
            };
        });

        await gameDetailsQueue.addBulk(childJobs);
        totalQueued += childJobs.length;

        await prisma.job.update({
            where: { id: jobId },
            data:  { totalItems: { increment: childJobs.length } },
        });

        await writeCheckpoint(jobId, {
            cursor: lastAppId.toString(),
            queuedItems: totalQueued,
        });

        log.info(`Page committed: ${childJobs.length} child jobs queued. Running total: ${totalQueued}.`);
    }

    await prisma.job.update({
        where: { id: jobId },
        data:  { allItemsQueued: true },
    });

    await createLog(
        jobId, "info",
        `Pagination complete. ${totalQueued} child job(s) queued across all pages.`
    );

    await tryCompleteParentJob(jobId);
    await clearCheckpoint(jobId);

    log.info("Steam games sync completed", { totalQueued, durationMs: Date.now() - start });
}