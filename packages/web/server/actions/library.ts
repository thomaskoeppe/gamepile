"use server";

import { getSetting } from "@/lib/app-settings";
import { enqueueJob } from "@/lib/jobs";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { AppSettingKey, JobStatus, JobType } from "@/prisma/generated/enums";
import { actionClientWithAuth } from "@/server/actions";

/** Job types that make up a full library sync (games + achievements chain). */
const LIBRARY_SYNC_JOB_TYPES = [
    JobType.IMPORT_USER_LIBRARY,
    JobType.IMPORT_USER_ACHIEVEMENTS,
] as const;

/**
 * Queues a Steam library re-sync for the current user.
 *
 * Rejected while a sync is already queued/running for the user, and during
 * the admin-configurable cooldown after the last successful import
 * ({@link AppSettingKey.LIBRARY_MANUAL_RESYNC_COOLDOWN_MINUTES}). Failed
 * imports do not start a cooldown, so users can retry after an error.
 *
 * @returns Success flag and the created job's ID.
 */
export const resyncLibrary = actionClientWithAuth
    .action(withLogging(async ({ ctx }, { log }) => {
        const userId = ctx.user.id;

        const pending = await prisma.job.findFirst({
            where: {
                type: { in: [...LIBRARY_SYNC_JOB_TYPES] },
                userId,
                status: { in: [JobStatus.QUEUED, JobStatus.ACTIVE] },
            },
            select: { id: true },
        });

        if (pending) {
            throw new Error("A library sync is already queued or running.");
        }

        const cooldownMinutes = getSetting(AppSettingKey.LIBRARY_MANUAL_RESYNC_COOLDOWN_MINUTES);

        if (cooldownMinutes > 0) {
            const lastSuccessful = await prisma.job.findFirst({
                where: {
                    type: JobType.IMPORT_USER_LIBRARY,
                    userId,
                    status: { in: [JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED] },
                    finishedAt: { not: null },
                },
                orderBy: { finishedAt: "desc" },
                select: { finishedAt: true },
            });

            if (lastSuccessful?.finishedAt) {
                const nextAllowedAt = lastSuccessful.finishedAt.getTime() + cooldownMinutes * 60_000;
                const remainingMs = nextAllowedAt - Date.now();

                if (remainingMs > 0) {
                    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
                    throw new Error(
                        `Your library was synced recently. Please wait ${remainingMinutes} minute(s) before syncing again.`,
                    );
                }
            }
        }

        const jobId = await enqueueJob(JobType.IMPORT_USER_LIBRARY, userId);

        log.info("Library re-sync queued by user", { userId, jobId });

        return { success: true, jobId };
    }, {
        namespace: "server.actions.library:resyncLibrary",
    }));
