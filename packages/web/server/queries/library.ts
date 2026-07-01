"use server";

import { getSetting } from "@/lib/app-settings";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { AppSettingKey, JobStatus, JobType } from "@/prisma/generated/enums";
import { queryClientWithAuth } from "@/server/query";

export type LibrarySyncStatus = {
    /** ISO timestamp of the last successful library import, or `null` if never synced. */
    lastSyncedAt: string | null;
    /** ISO timestamp when the next manual re-sync is allowed, or `null` if allowed now. */
    nextAllowedAt: string | null;
    /** Configured manual re-sync cooldown in minutes. */
    cooldownMinutes: number;
    /** Whether a library or achievements sync is currently queued or running. */
    syncInProgress: boolean;
};

/**
 * Reports the current user's library sync state: when the library was last
 * imported, whether a sync is running, and when the next manual re-sync is
 * allowed under the configured cooldown.
 */
export const getLibrarySyncStatus = queryClientWithAuth
    .query<LibrarySyncStatus>(withLogging(async ({ ctx }, { log }) => {
        const userId = ctx.user.id;

        log.debug("Fetching library sync status", { userId });

        const cooldownMinutes = getSetting(AppSettingKey.LIBRARY_MANUAL_RESYNC_COOLDOWN_MINUTES);

        const [lastSuccessful, pending] = await Promise.all([
            prisma.job.findFirst({
                where: {
                    type: JobType.IMPORT_USER_LIBRARY,
                    userId,
                    status: { in: [JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED] },
                    finishedAt: { not: null },
                },
                orderBy: { finishedAt: "desc" },
                select: { finishedAt: true },
            }),
            prisma.job.findFirst({
                where: {
                    type: { in: [JobType.IMPORT_USER_LIBRARY, JobType.IMPORT_USER_ACHIEVEMENTS] },
                    userId,
                    status: { in: [JobStatus.QUEUED, JobStatus.ACTIVE] },
                },
                select: { id: true },
            }),
        ]);

        const lastSyncedAt = lastSuccessful?.finishedAt ?? null;

        let nextAllowedAt: Date | null = null;
        if (lastSyncedAt && cooldownMinutes > 0) {
            const candidate = new Date(lastSyncedAt.getTime() + cooldownMinutes * 60_000);
            if (candidate.getTime() > Date.now()) {
                nextAllowedAt = candidate;
            }
        }

        return {
            lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
            nextAllowedAt: nextAllowedAt?.toISOString() ?? null,
            cooldownMinutes,
            syncInProgress: pending !== null,
        };
    }, {
        namespace: "server.queries.library:getLibrarySyncStatus",
    }));
