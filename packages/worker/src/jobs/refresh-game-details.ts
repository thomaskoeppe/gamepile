import prisma from "@/src/lib/prisma.js";
import { getWorkerEnv } from "@/src/lib/env.js";
import {logger} from "@/src/lib/logger.js";
import { gameDetailsQueue } from "@/src/lib/job/queue.js";
import { readCheckpoint, writeCheckpoint, clearCheckpoint } from "@/src/lib/job/checkpoint.js";
import { tryCompleteParentJob } from "@/src/lib/job/completion.js";
import { createLog } from "@/src/lib/job/log.js";
import {PRIORITY} from "@/src/lib/job/priority.js";

const PAGE_SIZE = 500;
const env = getWorkerEnv();

export default async function refreshGameDetails(opts: { jobId: string; }): Promise<void> {
    const { jobId } = opts;
    const log = logger.child("worker.jobs:refreshGameDetails", { jobId });
    const start = Date.now();

    const staleAfterDays = env.WORKER_GAME_DETAILS_REFRESH_DAYS;
    const staleThreshold = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1_000);

    const checkpoint = await readCheckpoint(jobId);
    let cursor:      string | null = checkpoint?.cursor      ?? null;
    let totalQueued: number        = checkpoint?.queuedItems ?? 0;

    if (checkpoint) {
        await createLog(jobId, "info",
            `Resuming refresh from checkpoint. alreadyQueued=${totalQueued}.`
        );
    }

    await createLog(jobId, "info",
        `Refreshing details for user-owned games with detailsFetchedAt < ${staleThreshold.toISOString()} ` +
        `(or never fetched). Threshold: ${staleAfterDays} days.`
    );

    let hasMore = true;

    while (hasMore) {
        const games = await prisma.game.findMany({
            where: {
                appId:     { not: null },
                userGames: { some: {} },
                OR: [
                    { detailsFetchedAt: null },
                    { detailsFetchedAt: { lt: staleThreshold } },
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

        await prisma.job.update({
            where: { id: jobId },
            data:  { totalItems: { increment: games.length } },
        });

        const childJobs = games
            .filter((g): g is typeof g & { appId: number } => g.appId !== null)
            .map((g) => ({
                name: "FETCH_GAME_DETAILS",
                data: { parentJobId: jobId, appId: g.appId, gameId: g.id, priority: PRIORITY.NORMAL },
                opts: {
                    attempts:         6,
                    backoff:          { type: "exponential" as const, delay: 2_000 },
                    removeOnComplete: 2_000,
                    removeOnFail:     5_000,
                    priority: PRIORITY.NORMAL
                },
            }));

        if (childJobs.length > 0) {
            await gameDetailsQueue.addBulk(childJobs);
            totalQueued += childJobs.length;
        }

        await writeCheckpoint(jobId, { cursor, queuedItems: totalQueued });

        log.info(
            `Queued ${childJobs.length} stale games for refresh. ` +
            `Running total: ${totalQueued}. Cursor: ${cursor}.`
        );
    }

    await prisma.job.update({
        where: { id: jobId },
        data:  { allItemsQueued: true },
    });

    await createLog(jobId, "info",
        `Refresh pagination complete. ${totalQueued} game(s) queued for detail update.`
    );

    await tryCompleteParentJob(jobId);
    await clearCheckpoint(jobId);

    log.info("Refresh game details job completed", { totalQueued, durationMs: Date.now() - start });
}