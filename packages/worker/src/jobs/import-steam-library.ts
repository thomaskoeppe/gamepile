import { gameDetailsQueue, jobsQueue } from "@/src/lib/job/queue.js";
import { isJobCancelled } from "@/src/lib/job/cancel.js";
import { createLog } from "@/src/lib/job/log.js";
import { isStaleOrStub, tryCompleteParentJob } from "@/src/lib/job/completion.js";
import { PRIORITY } from "@/src/lib/job/priority.js";
import { upsertGameStubs } from "@/src/lib/helper.js";
import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";
import { fetchSteamOwnedGames } from "@/src/lib/steam/games.js";
import { JobStatus, JobType } from "@/src/prisma/generated/enums.js";

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

    // Prune library entries for games Steam no longer reports as owned
    // (refunds, revoked keys, family-sharing changes). Runs only after a
    // successful non-empty fetch — the empty-response early return above
    // guarantees a flaky or private-profile response can never wipe a
    // library. Catalog data, collections, and vault keys are unaffected;
    // per-user achievements cascade with the UserGame row.
    const { count: prunedCount } = await prisma.userGame.deleteMany({
        where: {
            userId,
            game: { appId: { not: null, notIn: appIds } },
        },
    });

    if (prunedCount > 0) {
        log.info("Pruned user games no longer owned on Steam", { prunedCount });
        await createLog(jobId, "info",
            `${prunedCount} game(s) removed from library (no longer owned on Steam).`,
        );
    }

    if (await isJobCancelled(jobId)) {
        log.info("Import canceled — skipping detail-fetch enqueue", { durationMs: Date.now() - startMs });
        await createLog(jobId, "warn", "Import canceled by admin before queuing game details.");
        return;
    }

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

    await enqueueAchievementsImport(userId, jobId, log);

    log.info("Steam library import completed", { durationMs: Date.now() - startMs });
}

/**
 * Chains an achievements import after a library import.
 *
 * Achievement data only depends on the owned-games list (not on game
 * details), so the chain fires as soon as ownership records are in place.
 * Skipped when an achievements import is already queued or running for the
 * user. Failures are non-fatal — the library import itself has succeeded.
 *
 * @param userId - Internal user ID whose achievements should be imported.
 * @param libraryJobId - The library import job ID (for job-log attribution).
 * @param log - Contextual logger from the library import.
 */
async function enqueueAchievementsImport(
    userId: string,
    libraryJobId: string,
    log: ReturnType<typeof logger.child>,
): Promise<void> {
    try {
        const existing = await prisma.job.findFirst({
            where: {
                type: JobType.IMPORT_USER_ACHIEVEMENTS,
                userId,
                status: { in: [JobStatus.QUEUED, JobStatus.ACTIVE] },
            },
            select: { id: true },
        });

        if (existing) {
            log.debug("Achievements import already pending — skipping chain", {
                achievementsJobId: existing.id,
            });
            return;
        }

        const dbJob = await prisma.job.create({
            data: { type: JobType.IMPORT_USER_ACHIEVEMENTS, userId },
        });

        await jobsQueue.add(JobType.IMPORT_USER_ACHIEVEMENTS, {
            jobId: dbJob.id,
            type: JobType.IMPORT_USER_ACHIEVEMENTS,
            userId,
        });

        await createLog(libraryJobId, "info", "Queued follow-up achievements import.");
        log.info("Achievements import chained after library import", {
            achievementsJobId: dbJob.id,
        });
    } catch (error) {
        log.warn("Failed to chain achievements import (non-fatal)", {
            message: error instanceof Error ? error.message : "Unknown error",
        });
    }
}