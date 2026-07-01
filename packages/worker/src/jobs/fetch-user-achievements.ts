import type { Job } from "bullmq";

import { incrementProcessedItems, recordChildFailure } from "@/src/jobs/game-persistence.js";
import { isJobCancelled } from "@/src/lib/job/cancel.js";
import { isStaleOrStub, tryCompleteParentJob } from "@/src/lib/job/completion.js";
import { createLog } from "@/src/lib/job/log.js";
import { type AchievementsQueuePayload } from "@/src/lib/job/queue.js";
import { logger } from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";
import { fetchGameAchievementSchema, fetchPlayerAchievements } from "@/src/lib/steam/achievements.js";

/** Tolerance before a stored unlock timestamp is corrected to Steam's value. */
const UNLOCK_TIME_DRIFT_MS = 60_000;

/**
 * Synchronizes the achievement schema and one user's unlocks for a single app.
 *
 * Schema definitions are cached via `Game.achievementsFetchedAt` (staleness
 * follows the same window as game details), so games known to have zero
 * achievements skip both API calls on subsequent imports. On refresh,
 * definitions whose display data changed on Steam are updated in place.
 *
 * Unlocks are insert-only (never deleted), but their timestamps self-correct:
 * a `0` unlocktime from Steam is stored as "now" as a best guess, and gets
 * overwritten on a later run when Steam reports the real timestamp. The whole
 * operation is idempotent and safe to retry.
 *
 * @param app - The app to sync (Steam appId + internal game UUID).
 * @param userId - Internal user ID.
 * @param steamId - The user's 64-bit Steam ID.
 * @returns A short outcome tag used for batch-level log summaries.
 */
async function syncAchievementsForApp(
    app: { appId: number; gameId: string },
    userId: string,
    steamId: string,
): Promise<"synced" | "no-achievements" | "profile-private" | "skipped"> {
    const game = await prisma.game.findUnique({
        where:  { id: app.gameId },
        select: { createdAt: true, achievementsFetchedAt: true },
    });

    if (!game) {
        return "skipped";
    }

    // isStaleOrStub keys off detailsFetchedAt; the schema-freshness semantics
    // are identical, so map the achievements timestamp onto it.
    const schemaStale = isStaleOrStub({
        detailsFetchedAt: game.achievementsFetchedAt,
        createdAt: game.createdAt,
    });

    let achievementRows = await prisma.achievement.findMany({
        where:  { gameId: app.gameId },
        select: {
            id: true, name: true, displayName: true,
            description: true, icon: true, icongray: true, hidden: true,
        },
    });

    if (!schemaStale && achievementRows.length === 0) {
        return "no-achievements";
    }

    if (schemaStale) {
        const defs = await fetchGameAchievementSchema(app.appId);
        const existingByName = new Map(achievementRows.map((a) => [a.name, a]));

        const toCreate = defs.filter((def) => !existingByName.has(def.name));
        const toUpdate = defs.flatMap((def) => {
            const existing = existingByName.get(def.name);
            if (!existing) return [];

            const next = {
                displayName: def.displayName,
                description: def.description ?? "",
                icon: def.icon,
                icongray: def.icongray,
                hidden: def.hidden === 1,
            };
            const changed =
                existing.displayName !== next.displayName
                || existing.description !== next.description
                || existing.icon !== next.icon
                || existing.icongray !== next.icongray
                || existing.hidden !== next.hidden;

            return changed ? [{ id: existing.id, data: next }] : [];
        });

        if (toCreate.length > 0) {
            await prisma.achievement.createMany({
                data: toCreate.map((def) => ({
                    gameId: app.gameId,
                    name: def.name,
                    displayName: def.displayName,
                    description: def.description ?? "",
                    icon: def.icon,
                    icongray: def.icongray,
                    hidden: def.hidden === 1,
                })),
                skipDuplicates: true,
            });
        }

        for (const update of toUpdate) {
            await prisma.achievement.update({ where: { id: update.id }, data: update.data });
        }

        await prisma.game.update({
            where: { id: app.gameId },
            data:  { achievementsFetchedAt: new Date() },
        });

        if (defs.length === 0 && achievementRows.length === 0) {
            return "no-achievements";
        }

        if (toCreate.length > 0) {
            achievementRows = await prisma.achievement.findMany({
                where:  { gameId: app.gameId },
                select: {
                    id: true, name: true, displayName: true,
                    description: true, icon: true, icongray: true, hidden: true,
                },
            });
        }
    }

    if (achievementRows.length === 0) {
        return "no-achievements";
    }

    // Resolve the UserGame at execution time — the library may have been
    // pruned or re-imported since the parent job enqueued this batch.
    const userGame = await prisma.userGame.findUnique({
        where:  { userId_gameId: { userId, gameId: app.gameId } },
        select: { id: true },
    });

    if (!userGame) {
        return "skipped";
    }

    const result = await fetchPlayerAchievements(steamId, app.appId);

    if (!result.ok) {
        return result.reason === "profile-private" ? "profile-private" : "no-achievements";
    }

    const idByName = new Map(achievementRows.map((a) => [a.name, a.id]));
    const nowSecs = Math.floor(Date.now() / 1_000);

    const existingUnlocks = await prisma.userGameAchievement.findMany({
        where:  { userGameId: userGame.id },
        select: { id: true, achievementId: true, achievedAt: true },
    });
    const existingByAchievementId = new Map(existingUnlocks.map((u) => [u.achievementId, u]));

    const toInsert: Array<{ userGameId: string; achievementId: string; achievedAt: Date }> = [];
    const timestampFixes: Array<{ id: string; achievedAt: Date }> = [];

    for (const a of result.achievements) {
        if (a.achieved !== 1) continue;

        const achievementId = idByName.get(a.apiname);
        if (!achievementId) continue;

        const existing = existingByAchievementId.get(achievementId);

        if (!existing) {
            toInsert.push({
                userGameId: userGame.id,
                achievementId,
                achievedAt: new Date((a.unlocktime || nowSecs) * 1_000),
            });
        } else if (a.unlocktime > 0) {
            // Steam's timestamp is authoritative — corrects earlier rows that
            // were stored with the "now" fallback when unlocktime was 0.
            const steamTime = new Date(a.unlocktime * 1_000);
            if (Math.abs(existing.achievedAt.getTime() - steamTime.getTime()) > UNLOCK_TIME_DRIFT_MS) {
                timestampFixes.push({ id: existing.id, achievedAt: steamTime });
            }
        }
    }

    if (toInsert.length > 0) {
        await prisma.userGameAchievement.createMany({
            data: toInsert,
            skipDuplicates: true,
        });
    }

    for (const fix of timestampFixes) {
        await prisma.userGameAchievement.update({
            where: { id: fix.id },
            data:  { achievedAt: fix.achievedAt },
        });
    }

    return "synced";
}

/**
 * Handles a single batch from the `gamepile.achievements` queue.
 *
 * For each app in the batch, syncs the achievement schema and the user's
 * unlocks via {@link syncAchievementsForApp}. Expected per-app conditions
 * (no achievements, private profile, no longer owned) count as processed.
 *
 * Retriable errors (rate limits, transient failures on non-final attempts)
 * re-throw WITHOUT incrementing any counters, so BullMQ retries the whole
 * batch idempotently; apps already synced are skipped cheaply via the
 * schema-freshness check and `skipDuplicates` writes. On the final attempt,
 * per-app failures are recorded permanently instead.
 *
 * @param job - The BullMQ job containing the batch payload.
 * @throws {Error} On non-final attempts if an app fails (triggers BullMQ retry).
 */
export default async function handleFetchUserAchievements(
    job: Job<AchievementsQueuePayload>,
): Promise<void> {
    const { parentJobId, userId, steamId, apps } = job.data;
    const batchLog = logger.child("worker.jobs:fetchUserAchievements", { parentJobId, batchSize: apps.length });
    const startMs = Date.now();

    let shouldTryCompleteParent = true;

    if (await isJobCancelled(parentJobId)) {
        batchLog.debug("Skipped batch — parent cancelled");
        return;
    }

    const maxAttempts = job.opts?.attempts ?? 1;
    const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

    let processedCount = 0;
    let syncedCount = 0;
    let privateProfile = false;
    const failures: Array<{ appId: number; gameId: string; message: string }> = [];

    try {
        for (const app of apps) {
            if (await isJobCancelled(parentJobId)) {
                batchLog.debug("Cancelled mid-batch");
                shouldTryCompleteParent = false;
                return;
            }

            try {
                const outcome = await syncAchievementsForApp(app, userId, steamId);
                processedCount++;
                if (outcome === "synced") syncedCount++;
                if (outcome === "profile-private") privateProfile = true;
            } catch (error) {
                if (!isLastAttempt) {
                    // Retry the whole batch without crediting progress —
                    // nothing has been incremented yet, so no double counting.
                    shouldTryCompleteParent = false;
                    throw error;
                }

                failures.push({
                    appId: app.appId,
                    gameId: app.gameId,
                    message: error instanceof Error ? error.message : "Unknown error",
                });
            }
        }

        for (const failure of failures) {
            await recordChildFailure(
                parentJobId, failure.appId, failure.gameId, failure.message, job.attemptsMade + 1,
            );
        }

        if (processedCount > 0) {
            await incrementProcessedItems(parentJobId, processedCount);
        }

        if (privateProfile) {
            await createLog(parentJobId, "warn",
                "Steam profile or game details are private — achievement unlocks could not be read for some games.",
            );
        }

        batchLog.debug("Achievement batch completed", {
            processedCount,
            syncedCount,
            failedCount: failures.length,
            durationMs: Date.now() - startMs,
        });
    } finally {
        if (shouldTryCompleteParent) {
            await tryCompleteParentJob(parentJobId);
        }
    }
}
