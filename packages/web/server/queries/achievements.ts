"use server";

import { z } from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { queryClientWithAuth } from "@/server/query";

export type GameAchievementEntry = {
    id: string;
    displayName: string;
    description: string;
    icon: string;
    icongray: string;
    hidden: boolean;
    /** ISO timestamp of the current user's unlock, or `null` when locked. */
    achievedAt: string | null;
};

export type GameAchievementsForUser = {
    total: number;
    unlockedCount: number;
    achievements: GameAchievementEntry[];
};

/**
 * Fetches a game's achievement list annotated with the current user's unlock
 * state. Unlocked achievements come first (most recent unlock first),
 * followed by locked ones in display order. Users who don't own the game get
 * the full list with everything locked.
 */
export const getGameAchievementsForUser = queryClientWithAuth
    .inputSchema(z.object({ gameId: z.string().min(1) }))
    .query<GameAchievementsForUser>(withLogging(async ({ parsedInput: { gameId }, ctx }, { log }) => {
        const userId = ctx.user.id;

        log.debug("Fetching game achievements for user", { gameId, userId });

        const userGame = await prisma.userGame.findUnique({
            where:  { userId_gameId: { userId, gameId } },
            select: { id: true },
        });

        const achievements = await prisma.achievement.findMany({
            where: { gameId },
            select: {
                id: true,
                displayName: true,
                description: true,
                icon: true,
                icongray: true,
                hidden: true,
                userGameAchievements: userGame
                    ? { where: { userGameId: userGame.id }, select: { achievedAt: true } }
                    : { where: { userGameId: "none" }, select: { achievedAt: true } },
            },
            orderBy: { displayName: "asc" },
        });

        const entries = achievements.map((a) => ({
            id: a.id,
            displayName: a.displayName,
            description: a.description,
            icon: a.icon,
            icongray: a.icongray,
            hidden: a.hidden,
            achievedAt: a.userGameAchievements[0]?.achievedAt.toISOString() ?? null,
        }));

        entries.sort((a, b) => {
            if (a.achievedAt && b.achievedAt) return b.achievedAt.localeCompare(a.achievedAt);
            if (a.achievedAt) return -1;
            if (b.achievedAt) return 1;
            return a.displayName.localeCompare(b.displayName);
        });

        return {
            total: entries.length,
            unlockedCount: entries.filter((e) => e.achievedAt !== null).length,
            achievements: entries,
        };
    }, {
        namespace: "server.queries.achievements:getGameAchievementsForUser",
    }));
