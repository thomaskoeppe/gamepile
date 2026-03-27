import {gameDetailsQueue} from "@/src/lib/job/queue.js";
import prisma from "@/src/lib/prisma.js";
import {fetchSteamOwnedGames} from "@/src/lib/steam/games.js";
import {createLog} from "@/src/lib/job/log.js";
import {logger} from "@/src/lib/logger.js";
import {tryCompleteParentJob} from "@/src/lib/job/completion.js";
import {upsertGameStubs} from "@/src/lib/helper.js";
import {PRIORITY} from "@/src/lib/job/priority.js";

const DETAILS_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1_000;

function isStaleOrStub(game: { detailsFetchedAt: Date | null; createdAt: Date }): boolean {
    if (!game.detailsFetchedAt) return true;
    return Date.now() - game.detailsFetchedAt.getTime() > DETAILS_STALE_AFTER_MS;
}

export default async function job(payload: { jobId: string; userId: string; }) {
    const { jobId, userId } = payload;
    const log = logger.child("worker.jobs:importSteamLibrary", { jobId, userId });
    const start = Date.now();

    const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { id: true, steamId: true },
    });

    if (!user?.steamId) {
        log.error("User not found or has no steamId", new Error(`User ${userId} not found or has no steamId.`));
        throw new Error(`User ${userId} not found or has no steamId.`);
    }

    log.info("Starting Steam library import", { steamId: user.steamId });

    await createLog(jobId, "info", "Waiting for next available slot to fetch owned games from Steam...");

    const steamId = user.steamId;
    const ownedGames = await fetchSteamOwnedGames(steamId);

    log.info("Fetched owned games from Steam", {
        steamId,
        ownedGamesCount: ownedGames.length,
    });

    await createLog(jobId, "info", `Fetched ${ownedGames.length} owned games from Steam.`);

    if (ownedGames.length === 0) {
        log.info("No owned games — marking job as complete", { durationMs: Date.now() - start });

        await prisma.job.update({
            where: { id: jobId },
            data:  { totalItems: 0, allItemsQueued: true },
        });

        await tryCompleteParentJob(jobId);

        return;
    }

    await prisma.job.update({
        where: { id: jobId },
        data:  { totalItems: ownedGames.length, processedItems: 0 },
    });

    log.debug("Upserting game stubs", { count: ownedGames.length });

    await upsertGameStubs(
        ownedGames.map((o) => ({
            appId: o.appid,
            name: o.name ?? `App ${o.appid}`,
            steamLastModified: 0,
        }))
    );

    const appIds = ownedGames.map((o) => o.appid);
    const games = await prisma.game.findMany({
        where:  { appId: { in: appIds } },
        select: { id: true, appId: true, createdAt: true, detailsFetchedAt: true },
    });

    const gameByAppId = new Map(games.map((g) => [g.appId!, g]));

    const UPSERT_BATCH = 50;

    for (let i = 0; i < ownedGames.length; i += UPSERT_BATCH) {
        const batch = ownedGames.slice(i, i + UPSERT_BATCH);

        await Promise.all(
            batch.map((owned) => {
                const game = gameByAppId.get(owned.appid);
                if (!game) return Promise.resolve();

                return prisma.userGame.upsert({
                    where:  { userId_gameId: { userId, gameId: game.id } },
                    create: {
                        userId,
                        gameId: game.id,
                        playtime: owned.playtime_forever  ?? 0,
                        playtime2Weeks: owned.playtime_2weeks  ?? 0,
                    },
                    update: {
                        playtime: owned.playtime_forever  ?? 0,
                        playtime2Weeks: owned.playtime_2weeks   ?? 0,
                    },
                });
            }),
        );
    }

    log.debug("User games upserted");

    let alreadyCurrentCount = 0;
    const childJobs: Parameters<typeof gameDetailsQueue.addBulk>[0] = [];

    for (const owned of ownedGames) {
        const game = gameByAppId.get(owned.appid);
        if (!game) continue;

        if (!isStaleOrStub(game)) {
            alreadyCurrentCount++;
            continue;
        }

        childJobs.push({
            name: "FETCH_GAME_DETAILS",
            data: {
                parentJobId: jobId,
                appId: owned.appid,
                gameId: game.id,
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

    log.info("Child jobs prepared for detail fetch", {
        totalOwnedGames: ownedGames.length,
        alreadyCurrentCount,
        childJobsCount: childJobs.length,
    });

    await createLog(
        jobId, "info",
        `${alreadyCurrentCount} game(s) are current (skipped). ` +
        `${childJobs.length} game(s) queued for detail fetch.`,
    );

    if (alreadyCurrentCount > 0) {
        await prisma.job.update({
            where: { id: jobId },
            data:  { processedItems: { increment: alreadyCurrentCount } },
        });
    }

    if (childJobs.length > 0) {
        await gameDetailsQueue.addBulk(childJobs);
    }

    await prisma.job.update({
        where: { id: jobId },
        data:  { allItemsQueued: true },
    });

    await tryCompleteParentJob(jobId);

    log.info("Steam library import completed", { durationMs: Date.now() - start });
}