import type {Job} from "bullmq";

import prisma from "@/src/lib/prisma.js";
import {fetchGameDetails, mapPlatforms, parseSteamReleaseDate, SteamAppDetails} from "@/src/lib/steam/games.js";
import {createLog} from "@/src/lib/job/log.js";
import {GameDetailsQueuePayload} from "@/src/lib/job/queue.js";
import {redis} from "@/src/lib/redis.js";
import {logger} from "@/src/lib/logger.js";
import {tryCompleteParentJob} from "@/src/lib/job/completion.js";
import {GameType} from "@/src/prisma/generated/enums.js";

async function recordChildFailure(
    parentJobId: string,
    appId: number,
    gameId: string | undefined,
    errorMessage: string,
    attempts: number,
): Promise<void> {
    await prisma.failedChildJob.create({
        data: {jobId: parentJobId, appId, gameId, errorMessage, attempts},
    });

    await prisma.job.update({
        where: {id: parentJobId},
        data: {failedItems: {increment: 1}},
    });

    await createLog(
        parentJobId, "warn",
        `appId=${appId} permanently failed after ${attempts} attempt(s): ${errorMessage}`
    );
}

export default async function job(job: Job<GameDetailsQueuePayload>) {
    const {parentJobId, appId, gameId} = job.data;
    const log = logger.child("worker.jobs:fetchGameDetails", { parentJobId, appId, gameId });
    const start = Date.now();
    let shouldTryCompleteParent = true;

    if ((await redis.get(`cancel:parent:${parentJobId}`)) === "1") {
        log.info("Skipped — parent cancelled");
        return;
    }

    const maxAttempts = job.opts?.attempts ?? 1;
    const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

    log.info("Starting fetch", {
        attemptsMade: job.attemptsMade + 1,
        maxAttempts,
        isLastAttempt,
    });

    try {
        log.debug("Fetching Steam details");

        const details: SteamAppDetails | null = await fetchGameDetails(appId);

        if ((await redis.get(`cancel:parent:${parentJobId}`)) === "1") {
            log.info("Cancelled after fetch");
            shouldTryCompleteParent = false;
            return;
        }

        if (!details) {
            await recordChildFailure(
                parentJobId, appId, gameId,
                "Steam returned no details for this appId - game is likely restricted in this country.",
                job.attemptsMade + 1,
            );

            await tryCompleteParentJob(parentJobId);
            return;
        }

        log.debug("Fetched details", { name: details.name });

        await prisma.category.createMany({
            data: (details.categories ?? []).map((c) => ({
                categoryId: c.id,
                name: c.description,
            })),
            skipDuplicates: true,
        });

        await prisma.genre.createMany({
            data: (details.genres ?? []).map((g) => ({
                genreId: Number(g.id),
                name: g.description,
            })),
            skipDuplicates: true,
        });

        const [categories, genres] = await Promise.all([
            prisma.category.findMany({
                where: {categoryId: {in: details.categories?.map((c) => c.id) ?? []}},
            }),
            prisma.genre.findMany({
                where: {genreId: {in: details.genres?.map((g) => Number(g.id)) ?? []}},
            }),
        ]);

        log.debug("Upserting game record", {
            categoryCount: categories.length,
            genreCount: genres.length,
            name: details.name,
        });

        let type: GameType;
        switch (details.type) {
            case "game":
                type = GameType.GAME
                break;
            case "dlc":
                type = GameType.DLC
                break;
            case "demo":
                type = GameType.DEMO
                break;
            case "mod":
                type = GameType.MOD
                break;
            case "advertising":
                type = GameType.ADVERTISING
                break;
            default:
                type = GameType.UNKNOWN;
        }

        const sharedFields = {
            name: details.name,
            type: type,
            isFree: details.is_free,
            description: details.detailed_description,
            shortDescription: details.short_description,
            developers: details.developers ?? [],
            publishers: details.publishers ?? [],
            releaseDate: parseSteamReleaseDate(details.release_date?.date, details.release_date?.coming_soon),
            metacriticScore: details.metacritic?.score ?? null,
            platforms: mapPlatforms(details.platforms),
            detailsFetchedAt: new Date()
        };

        if (gameId) {
            const existingGame = await prisma.game.findUnique({
                where: { id: gameId },
                select: { id: true },
            });

            if (existingGame) {
                await prisma.game.update({
                    where: { id: gameId },
                    data: {
                        ...sharedFields,
                        categories: { set: categories },
                        genres: { set: genres },
                    },
                });
            } else {
                await prisma.game.upsert({
                    where: { appId: details.steam_appid },
                    create: {
                        ...sharedFields,
                        appId: details.steam_appid,
                        tags: [],
                        categories: { connect: categories },
                        genres: { connect: genres },
                    },
                    update: {
                        ...sharedFields,
                        categories: { set: categories },
                        genres: { set: genres },
                    },
                });
            }
        } else {
            await prisma.game.upsert({
                where: { appId: details.steam_appid },
                create: {
                    ...sharedFields,
                    appId: details.steam_appid,
                    tags: [],
                    categories: { connect: categories },
                    genres: { connect: genres },
                },
                update: {
                    ...sharedFields,
                    categories: { set: categories },
                    genres: { set: genres },
                },
            });
        }

        await prisma.job.update({
            where: {id: parentJobId},
            data: {processedItems: {increment: 1}},
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        log.error("Fetch attempt failed", error instanceof Error ? error : undefined, {
            attempt: job.attemptsMade + 1,
            isLastAttempt,
            durationMs: Date.now() - start,
        });

        if (isLastAttempt) {
            await recordChildFailure(
                parentJobId, appId, gameId, message, job.attemptsMade + 1
            );
        } else {
            throw error;
        }
    } finally {
        if (shouldTryCompleteParent) {
            await tryCompleteParentJob(parentJobId);
        }
    }

}