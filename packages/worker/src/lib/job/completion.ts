import prisma from "@/src/lib/prisma.js";
import { JobStatus } from "@/src/prisma/generated/enums.js";
import { createLog } from "@/src/lib/job/log.js";
import { logger } from "@/src/lib/logger.js";
import { getWorkerEnv } from "@/src/lib/env.js";

const log = logger.child("worker.jobs:completion");

const env = getWorkerEnv();
/** Maximum age (in ms) before a game's details are considered stale and need re-fetching. */
const DETAILS_STALE_AFTER_MS = env.WORKER_GAME_DETAILS_REFRESH_DAYS * 24 * 60 * 60 * 1_000;
/** Minimum freshness floor (24 h) — games fetched within this window are never considered stale. */
const FRESHNESS_FLOOR_MS = 24 * 60 * 60 * 1_000;

/**
 * Determines whether a game's details need to be (re-)fetched.
 *
 * A game is considered stale if:
 * - It has never had its details fetched (`detailsFetchedAt` is null), or
 * - Its details are older than {@link DETAILS_STALE_AFTER_MS} and beyond the
 *   24-hour freshness floor.
 *
 * @param game - Object containing `detailsFetchedAt` and `createdAt` timestamps.
 * @returns `true` if the game's details should be refreshed.
 */
export function isStaleOrStub(game: { detailsFetchedAt: Date | null; createdAt: Date }): boolean {
    if (!game.detailsFetchedAt) return true;

    const age = Date.now() - game.detailsFetchedAt.getTime();
    if (age < FRESHNESS_FLOOR_MS) return false;

    return age > DETAILS_STALE_AFTER_MS;
}

/**
 * Attempts to mark a parent job as completed (or partially completed) based on
 * the progress of its child detail-fetch jobs.
 *
 * Runs inside a Prisma transaction with optimistic locking on the job status.
 * The job is only marked complete when:
 * 1. `allItemsQueued` is `true`, and
 * 2. `processedItems + failedItems >= totalItems`
 *
 * If any child jobs failed, the status is set to `PARTIALLY_COMPLETED`; otherwise `COMPLETED`.
 *
 * @param parentJobId - The UUID of the parent job to evaluate.
 */
export async function tryCompleteParentJob(parentJobId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const job = await tx.job.findUnique({
            where: { id: parentJobId },
            select: {
                status: true,
                processedItems: true,
                failedItems: true,
                totalItems: true,
                allItemsQueued: true,
            },
        });

        log.debug("Evaluating parent job for completion", {
            jobId: parentJobId,
            status: job?.status,
            processedItems: job?.processedItems,
            failedItems: job?.failedItems,
            totalItems: job?.totalItems,
            allItemsQueued: job?.allItemsQueued,
        });

        if (!job || job.status !== JobStatus.ACTIVE) return;
        if (!job.allItemsQueued) return;

        const allDone = job.totalItems === 0 || job.processedItems + job.failedItems >= job.totalItems;
        if (!allDone) return;

        const newStatus: JobStatus = job.failedItems > 0 ? JobStatus.PARTIALLY_COMPLETED : JobStatus.COMPLETED;

        const logLevel = newStatus === JobStatus.COMPLETED ? "info" : "warn";
        const summary = `${job.processedItems} succeeded, ${job.failedItems} failed out of ${job.totalItems} total.`;

        const { count } = await tx.job.updateMany({
            where: { id: parentJobId, status: JobStatus.ACTIVE },
            data: { status: newStatus, finishedAt: new Date() },
        });

        if (count === 0) return;

        log.info(`Parent job ${parentJobId} marked as ${newStatus}`, {
            jobId: parentJobId,
            newStatus,
            summary,
        });

        await createLog(parentJobId, logLevel, `Job ${newStatus}: ${summary}`);
    });
}