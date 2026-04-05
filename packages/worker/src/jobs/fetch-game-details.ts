import type {Job} from "bullmq";

import {createGameStub, persistGameDetails, recordChildFailure,} from "@/src/jobs/game-persistence.js";
import {isStaleOrStub, tryCompleteParentJob} from "@/src/lib/job/completion.js";
import {createLog} from "@/src/lib/job/log.js";
import {type GameDetailsQueuePayload} from "@/src/lib/job/queue.js";
import {logger} from "@/src/lib/logger.js";
import {redis} from "@/src/lib/redis.js";
import {fetchStoreBrowseDetailsBatch} from "@/src/lib/steam/api/store-browse.js";
import {publishDetailJobCompletion} from "@/src/lib/worker-metrics.js";
import prisma from "@/src/lib/prisma.js";

/**
 * Increments the `processedItems` counter on a parent job record.
 *
 * @param parentJobId - UUID of the parent job.
 * @param count - Number of items to add to the counter.
 */
async function incrementProcessedItems(parentJobId: string, count: number): Promise<void> {
    await prisma.job.update({
        where: {id: parentJobId},
        data: {processedItems: {increment: count}},
    });
}

/**
 * Checks whether a parent job has been canceled via a Redis flag.
 *
 * @param parentJobId - UUID of the parent job to check.
 * @returns `true` if the cancellation flag is set in Redis.
 */
async function isParentCancelled(parentJobId: string): Promise<boolean> {
    return (await redis.get(`cancel:parent:${parentJobId}`)) === "1";
}

/**
 * Handles a single batch of game-detail fetch jobs from the `gamepile.game-details` queue.
 *
 * For each appId in the batch:
 * 1. Checks if the game's details are already fresh (skips if so).
 * 2. Fetches details from the Steam Store API via {@link fetchStoreBrowseDetailsBatch}.
 * 3. Persists full details or creates a stub record for items not returned by Steam.
 * 4. Records failures and publishes throughput metrics.
 *
 * Supports cancellation between API calls via Redis cancellation flags.
 * On the last retry attempt, permanently records failures rather than re-throwing.
 *
 * @param job - The BullMQ job containing the batch payload.
 * @throws {Error} On non-final attempts if the batch fetch fails (triggers BullMQ retry).
 */
export default async function handleFetchGameDetails(job: Job<GameDetailsQueuePayload>): Promise<void> {
    const {parentJobId, appIds, gameIdMap} = job.data;
    const batchSize = appIds.length;
    const log = logger.child("worker.jobs:fetchGameDetails", {parentJobId, batchSize});
    const startMs = Date.now();

    let shouldTryCompleteParent = true;

    if (await isParentCancelled(parentJobId)) {
        log.debug("Skipped batch — parent cancelled");
        return;
    }

    const maxAttempts = job.opts?.attempts ?? 1;
    const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

    const existingGames = await prisma.game.findMany({
        where: {appId: {in: appIds}},
        select: {appId: true, createdAt: true, detailsFetchedAt: true},
    });

    const existingByAppId = new Map(existingGames.map((g) => [g.appId!, g]));

    const staleAppIds: number[] = [];
    let freshCount = 0;

    for (const appId of appIds) {
        const game = existingByAppId.get(appId);
        if (game && !isStaleOrStub(game)) {
            freshCount++;
        } else {
            staleAppIds.push(appId);
        }
    }

    if (freshCount > 0) {
        await incrementProcessedItems(parentJobId, freshCount);
        await createLog(parentJobId, "info",
            `Batch: ${freshCount} app(s) skipped — details already fresh`,
        );
        for (const appId of appIds) {
            const game = existingByAppId.get(appId);
            if (game && !isStaleOrStub(game)) {
                await publishDetailJobCompletion(`${parentJobId}:${appId}`);
            }
        }
    }

    if (staleAppIds.length === 0) {
        log.debug("All apps in batch are fresh — nothing to fetch");
        await tryCompleteParentJob(parentJobId);
        return;
    }

    log.debug("Starting batch fetch", {
        staleCount: staleAppIds.length,
        freshSkipped: freshCount,
        attemptsMade: job.attemptsMade + 1,
        maxAttempts,
    });

    try {
        if (await isParentCancelled(parentJobId)) {
            log.debug("Cancelled before fetch");
            shouldTryCompleteParent = false;
            return;
        }

        const detailsMap = await fetchStoreBrowseDetailsBatch(staleAppIds);

        if (await isParentCancelled(parentJobId)) {
            log.debug("Cancelled after fetch");
            shouldTryCompleteParent = false;
            return;
        }

        let successCount = 0;
        let stubCount = 0;

        for (const appId of staleAppIds) {
            const details = detailsMap.get(appId);
            const gameId = gameIdMap[appId];

            if (!details) {
                await createGameStub(appId, gameId);
                stubCount++;
            } else {
                await persistGameDetails(details, gameId);
                successCount++;
            }

            await publishDetailJobCompletion(`${parentJobId}:${appId}`);
        }

        await incrementProcessedItems(parentJobId, staleAppIds.length);

        log.debug("Batch completed", {
            successCount,
            stubCount,
            durationMs: Date.now() - startMs,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";

        log.error("Batch fetch failed", error instanceof Error ? error : undefined, {
            attempt: job.attemptsMade + 1,
            isLastAttempt,
            batchSize: staleAppIds.length,
            durationMs: Date.now() - startMs,
        });

        if (isLastAttempt) {
            for (const appId of staleAppIds) {
                await recordChildFailure(parentJobId, appId, gameIdMap[appId], message, job.attemptsMade + 1);
                await publishDetailJobCompletion(`${parentJobId}:${appId}`);
            }
        } else {
            shouldTryCompleteParent = false;
            throw error;
        }
    } finally {
        if (shouldTryCompleteParent) {
            await tryCompleteParentJob(parentJobId);
        }
    }
}
