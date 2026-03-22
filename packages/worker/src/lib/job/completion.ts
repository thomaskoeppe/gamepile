import prisma from "@/src/lib/prisma.js";
import { JobStatus } from "@/src/prisma/generated/enums.js";
import { createLog } from "@/src/lib/job/log.js";
import {logger} from "@/src/lib/logger.js";

const log = logger.child("worker.jobs:completion");

/**
 * Checks whether a parent job's child items have all finished and, if so,
 * transitions it to COMPLETED or PARTIALLY_COMPLETED within a transaction.
 *
 * @param parentJobId - The database ID of the parent job to evaluate.
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

        log.info(`Attempting to complete parent job ${parentJobId}.`, {
            jobId: parentJobId,
            jobStatus: job?.status,
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

        log.info(`Parent job ${parentJobId} marked as ${newStatus}.`, {
            jobId: parentJobId,
            newStatus,
            summary,
            updateCount: count,
        });

        if (count === 0) return;

        await createLog(parentJobId, logLevel, `Job ${newStatus}: ${summary}`);
    });
}