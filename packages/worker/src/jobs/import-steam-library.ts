import { gameDetailsQueue } from "@/src/lib/job/queue.js";
import { createLog } from "@/src/lib/job/log.js";
import { isStaleOrStub, tryCompleteParentJob } from "@/src/lib/job/completion.js";
import { PRIORITY } from "@/src/lib/job/priority.js";
import { upsertGameStubs } from "@/src/lib/helper.js";
import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";
import { fetchSteamOwnedGames } from "@/src/lib/steam/games.js";

/** Number of user-game records to upsert per batch. */
const UPSERT_BATCH_SIZE = 50;

/**
 * Imports a Steam user's game library into the platform.
 *
 * Workflow:
 * 1. Fetches the user's owned games from the Steam API.
 * 2. Upserts minimal game stubs for every owned game.
 * 3. Upserts `UserGame` records (ownership + playtime).
 * 4. Identifies games with stale or missing details.
 * 5. Enqueues batched detail-fetch child jobs on the game-details queue.
 * 6. Evaluates parent job completion.
 *
 * @param payload - Import parameters.
 * @param payload.jobId - The database job ID tracking this import.
 * @param payload.userId - The internal user ID whose library is being imported.
 * @throws {Error} If the user is not found or has no Steam ID.
 */
export default async function importSteamLibrary(payload: {
    jobId: string;
    userId: string;
}): Promise<void> {
    const { jobId, userId } = payload;
    const log = logger.child("worker.jobs:importSteamLibrary", { jobId, userId });
    const startMs = Date.now();
    const batchSize = getWorkerEnv().WORKER_DETAILS_BATCH_SIZE;

    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { id: true, steamId: true },
    });

    if (!user?.steamId) {
        throw new Error(`User ${userId} not found or has no steamId.`);
    }

    log.info("Starting Steam library import", { steamId: user.steamId });
    await createLog(jobId, "info", "Waiting for next available slot to fetch owned games from Steam...");

    const ownedGames = await fetchSteamOwnedGames(user.steamId);

    log.info("Fetched owned games from Steam", {
        steamId: user.steamId,
        ownedGamesCount: ownedGames.length,
    });

    await createLog(jobId, "info", `Fetched ${ownedGames.length} owned games from Steam.`);

    if (ownedGames.length === 0) {
        log.info("No owned games — marking job as complete", { durationMs: Date.now() - startMs });

        await prisma.job.update({
            where: { id: jobId },
            data: { totalItems: 0, allItemsQueued: true },
        });

        await tryCompleteParentJob(jobId);
        return;
    }

    await prisma.job.update({
        where: { id: jobId },
        data: { totalItems: ownedGames.length, processedItems: 0 },
    });

    log.debug("Upserting game stubs", { count: ownedGames.length });

    await upsertGameStubs(
        ownedGames.map((o) => ({
            appId: o.appid,
            name: o.name ?? `App ${o.appid}`,
            steamLastModified: null,
        })),
    );

    const appIds = ownedGames.map((o) => o.appid);
    const games = await prisma.game.findMany({
        where:  { appId: { in: appIds } },
        select: { id: true, appId: true, createdAt: true, detailsFetchedAt: true },
    });

    const gameByAppId = new Map(games.map((g) => [g.appId!, g]));

    for (let i = 0; i < ownedGames.length; i += UPSERT_BATCH_SIZE) {
        const batch = ownedGames.slice(i, i + UPSERT_BATCH_SIZE);

        await Promise.all(
            batch.map((owned) => {
                const game = gameByAppId.get(owned.appid);
                if (!game) return Promise.resolve();

                return prisma.userGame.upsert({
                    where:  { userId_gameId: { userId, gameId: game.id } },
                    create: {
                        userId,
                        gameId:         game.id,
                        playtime:       owned.playtime_forever ?? 0,
                        playtime2Weeks: owned.playtime_2weeks ?? 0,
                    },
                    update: {
                        playtime:       owned.playtime_forever ?? 0,
                        playtime2Weeks: owned.playtime_2weeks ?? 0,
                    },
                });
            }),
        );
    }

    log.debug("User games upserted");

    let alreadyCurrentCount = 0;
    const staleGames: Array<{ appId: number; gameId: string }> = [];

    for (const owned of ownedGames) {
        const game = gameByAppId.get(owned.appid);
        if (!game) continue;

        if (!isStaleOrStub(game)) {
            alreadyCurrentCount++;
            continue;
        }

        staleGames.push({ appId: owned.appid, gameId: game.id });
    }

    log.info("Child batch jobs prepared for detail fetch", {
        totalOwnedGames: ownedGames.length,
        alreadyCurrentCount,
        staleGamesCount: staleGames.length,
    });

    await createLog(
        jobId, "info",
        `${alreadyCurrentCount} game(s) are current (skipped). ` +
        `${staleGames.length} game(s) queued for detail fetch.`,
    );

    if (alreadyCurrentCount > 0) {
        await prisma.job.update({
            where: { id: jobId },
            data: { processedItems: { increment: alreadyCurrentCount } },
        });
    }

    if (staleGames.length > 0) {
        const childJobs: Parameters<typeof gameDetailsQueue.addBulk>[0] = [];

        for (let i = 0; i < staleGames.length; i += batchSize) {
            const chunk = staleGames.slice(i, i + batchSize);
            const chunkAppIds = chunk.map((g) => g.appId);
            const gameIdMap: Record<number, string> = {};

            for (const g of chunk) {
                gameIdMap[g.appId] = g.gameId;
            }

            childJobs.push({
                name: "FETCH_GAME_DETAILS_BATCH",
                data: {
                    parentJobId: jobId,
                    appIds: chunkAppIds,
                    gameIdMap,
                    priority: PRIORITY.HIGH,
                },
                opts: {
                    priority: PRIORITY.HIGH,
                    attempts: 6,
                    backoff: { type: "exponential" as const, delay: 2_000 },
                    removeOnComplete: 2_000,
                    removeOnFail: 5_000,
                },
            });
        }

        await gameDetailsQueue.addBulk(childJobs);
    }

    await prisma.job.update({
        where: { id: jobId },
        data: { allItemsQueued: true },
    });

    await tryCompleteParentJob(jobId);

    log.info("Steam library import completed", { durationMs: Date.now() - startMs });
}