"use server";

import {requireAdmin} from "@/lib/auth/admin";
import { getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import {jobsQueue} from "@/lib/queue";
import {redis} from "@/lib/redis";
import { JobStatus, JobType } from "@/prisma/generated/enums";
import { JobSnapshot } from "@/types/job";

const log = logger.child("server.actions.jobs");

const LOG_TAIL = 20;

const TERMINAL_JOB_WINDOW_MS = 24 * 60 * 60 * 1_000;

/**
 * Fetches the most recent job of the given type for the current user.
 * Only returns jobs that are still active/queued, or terminal jobs finished
 * within the last 24 hours.
 *
 * @param jobType - The job type to look up.
 * @returns The latest matching job snapshot, or `null` if none found.
 */
export async function getLatestJobByType(
    jobType: JobType,
): Promise<JobSnapshot | null> {
    const session = await getCurrentSession();
    if (!session) {
        log.debug("getLatestJobByType called without session", { jobType });
        return null;
    }

    const cutoff = new Date(Date.now() - TERMINAL_JOB_WINDOW_MS);

    log.debug("Fetching latest job by type", { jobType, userId: session.user.id });

    const job = await prisma.job.findFirst({
        where: {
            type:   jobType,
            userId: session.user.id,
            OR: [
                {
                    status: { in: [JobStatus.QUEUED, JobStatus.ACTIVE] },
                },
                {
                    status: { in: [JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED, JobStatus.FAILED] },
                    finishedAt: { gte: cutoff },
                },
            ],
        },
        orderBy: { createdAt: "desc" },
        select: {
            id:             true,
            type:           true,
            status:         true,
            processedItems: true,
            totalItems:     true,
            failedItems:    true,
            allItemsQueued: true,
            startedAt:      true,
            finishedAt:     true,
            errorMessage:   true,
            createdAt:      true,
            logs: {
                orderBy: { timestamp: "desc" },
                take:    LOG_TAIL,
                select: {
                    id:        true,
                    message:   true,
                    level:     true,
                    timestamp: true,
                },
            },
        },
    });

    if (!job) {
        log.debug("No matching job found", { jobType, userId: session.user.id });
        return null;
    }

    log.debug("Job found", { jobType, jobId: job.id, status: job.status, userId: session.user.id });

    return {
        ...job,
        startedAt:  job.startedAt?.toISOString()  ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        createdAt:  job.createdAt.toISOString(),
        logs: job.logs
            .reverse()
            .map((l) => ({ ...l, timestamp: l.timestamp.toISOString() })),
    };
}

/**
 * Creates a new job record in the database and enqueues it via BullMQ.
 *
 * @param type - The type of job to create.
 * @param userId - Optional user to associate the job with.
 */
export async function createJob(type: JobType, userId?: string): Promise<void> {
    const job = await prisma.job.create({
        data: {
            type,
            user: userId ? { connect: { id: userId } } : undefined,
        },
    });

    await jobsQueue.add(type, { jobId: job.id, userId, type });

    log.info("Admin job created and queued", {
        jobId: job.id,
        type,
        userId,
    });
}

/**
 * Cancels an active or queued job by marking it as CANCELED in the database
 * and setting a Redis cancellation flag for in-flight workers to detect.
 * Requires admin privileges.
 *
 * @param jobId - The ID of the job to cancel.
 */
export async function cancelJob(jobId: string): Promise<void> {
    await requireAdmin();

    log.info("Canceling job", { jobId });

    await prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.CANCELED, errorMessage: "Job canceled by admin", finishedAt: new Date() },
    });

    await prisma.jobLog.create({
        data: {
            jobId,
            level: "error",
            message: "Job canceled by admin",
        }
    });

    await redis.set(`cancel:parent:${jobId}`, "1", "EX", 60 * 60);

    log.info("Job canceled", { jobId });
}