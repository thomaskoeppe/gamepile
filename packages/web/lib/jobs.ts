import "server-only";

import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { jobsQueue } from "@/lib/queue";
import { JobType } from "@/prisma/generated/enums";

const log = logger.child("server.services.jobs");

/**
 * Creates a new job record in the database and enqueues it via BullMQ.
 *
 * Internal server-side helper — callers are responsible for authorization
 * (this is intentionally NOT a server action; it must never be directly
 * invokable from the client).
 *
 * @param type - The type of job to create.
 * @param userId - Optional user to associate the job with.
 * @returns The created job's ID.
 */
export async function enqueueJob(type: JobType, userId?: string): Promise<string> {
    const job = await prisma.job.create({
        data: {
            type,
            user: userId ? { connect: { id: userId } } : undefined,
        },
    });

    await jobsQueue.add(type, { jobId: job.id, userId, type });

    log.info("Job created and queued", {
        jobId: job.id,
        type,
        userId,
    });

    return job.id;
}
