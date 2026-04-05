import { randomUUID } from "node:crypto";

import { JobStatus } from "@/src/prisma/generated/enums.js";

import { jobsQueue } from "@/src/lib/job/queue.js";
import { logger } from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";
import { redis } from "@/src/lib/redis.js";

/**
 * Recovers jobs that are stuck in `ACTIVE` status in the database but are no longer
 * being processed by any BullMQ worker.
 *
 * This can happen when a worker crashes without gracefully completing or failing its jobs.
 * A distributed Redis lock ensures only one worker runs recovery at a time.
 *
 * Recovered jobs are reset to `QUEUED` status so they can be picked up again.
 *
 * @param payload - Recovery configuration.
 * @param payload.hostname - The hostname of the worker performing recovery.
 * @param payload.staleActiveRecoveryDelayMs - Minimum age (ms) before an ACTIVE job is considered stale.
 * @param payload.activeRecoveryLockTtlMs - TTL (ms) for the distributed recovery lock.
 */
export async function recoverStaleJobs(payload: {
    hostname: string;
    staleActiveRecoveryDelayMs: number;
    activeRecoveryLockTtlMs: number;
}): Promise<void> {
    const { hostname, staleActiveRecoveryDelayMs, activeRecoveryLockTtlMs } = payload;
    const log = logger.child("worker.recovery:staleActive", { hostname });
    const lockKey = "gamepile:worker:recover-active-jobs:lock";
    const lockToken = `${hostname}:${randomUUID()}`;

    const lock = await redis.set(lockKey, lockToken, "PX", activeRecoveryLockTtlMs, "NX");
    if (lock !== "OK") {
        log.debug("Skipping stale ACTIVE recovery — another worker holds the lock", { lockKey });
        return;
    }

    const staleBefore = new Date(Date.now() - staleActiveRecoveryDelayMs);
    const activeQueueJobs = await jobsQueue.getActive();
    const activelyProcessingParentIds = new Set(
        activeQueueJobs
            .map((queuedJob) => queuedJob.data?.jobId)
            .filter((jobId): jobId is string => typeof jobId === "string" && jobId.length > 0),
    );

    const candidates = await prisma.job.findMany({
        where: {
            status: JobStatus.ACTIVE,
            startedAt: { lte: staleBefore },
        },
        select: {
            id: true,
            claimedBy: true,
            startedAt: true,
        },
    });

    let recoveredCount = 0;
    for (const candidate of candidates) {
        if (activelyProcessingParentIds.has(candidate.id)) {
            continue;
        }

        const { count } = await prisma.job.updateMany({
            where: { id: candidate.id, status: JobStatus.ACTIVE },
            data: { status: JobStatus.QUEUED, claimedBy: null, startedAt: null },
        });

        if (count > 0) {
            recoveredCount += 1;
            log.warn("Recovered stale ACTIVE job", {
                jobId: candidate.id,
                claimedBy: candidate.claimedBy,
                startedAt: candidate.startedAt?.toISOString(),
            });
        }
    }

    if (recoveredCount > 0) {
        log.warn("Recovered stale ACTIVE jobs", {
            recoveredJobs: recoveredCount,
            staleBefore: staleBefore.toISOString(),
            staleDelayMs: staleActiveRecoveryDelayMs,
        });
    }
}
