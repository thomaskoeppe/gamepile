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

export type AchievementGameMeta = {
    id: string;
    name: string;
    appId: number | null;
    headerImageUrl: string | null;
    capsuleImageUrl: string | null;
    libraryCapsuleUrl: string | null;
};

export type GameAchievementsForUser = {
    /** Basic display metadata for the game, or `null` when the game doesn't exist. */
    game: AchievementGameMeta | null;
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

        const [game, userGame] = await Promise.all([
            prisma.game.findUnique({
                where:  { id: gameId },
                select: {
                    id: true,
                    name: true,
                    appId: true,
                    headerImageUrl: true,
                    capsuleImageUrl: true,
                    libraryCapsuleUrl: true,
                },
            }),
            prisma.userGame.findUnique({
                where:  { userId_gameId: { userId, gameId } },
                select: { id: true },
            }),
        ]);

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
            game,
            total: entries.length,
            unlockedCount: entries.filter((e) => e.achievedAt !== null).length,
            achievements: entries,
        };
    }, {
        namespace: "server.queries.achievements:getGameAchievementsForUser",
    }));

export type AchievementGameProgress = AchievementGameMeta & {
    total: number;
    unlocked: number;
    /** Completion percentage, 0-100, rounded. */
    percent: number;
    /** ISO timestamp of the most recent unlock for this game, or `null`. */
    lastUnlockAt: string | null;
};

export type AchievementOverview = {
    stats: {
        totalUnlocked: number;
        totalAchievements: number;
        /** Mean of per-game completion percentages, 0-100, rounded. */
        averageCompletion: number;
        perfectGames: number;
        gamesInProgress: number;
        gamesNotStarted: number;
    };
    /** One entry per owned game that has achievements, completion-desc. */
    games: AchievementGameProgress[];
};

/**
 * Aggregates the current user's achievement progress across their library:
 * per-game unlocked/total counts with the latest unlock date, plus summary
 * stats (totals, average completion, perfect games). Only owned games that
 * actually have achievements are included.
 */
export const getAchievementOverview = queryClientWithAuth
    .query<AchievementOverview>(withLogging(async ({ ctx }, { log }) => {
        const userId = ctx.user.id;

        log.debug("Fetching achievement overview", { userId });

        const [userGames, latestUnlocks] = await Promise.all([
            prisma.userGame.findMany({
                where: { userId, game: { achievements: { some: {} } } },
                select: {
                    id: true,
                    _count: { select: { userGameAchievements: true } },
                    game: {
                        select: {
                            id: true,
                            name: true,
                            appId: true,
                            headerImageUrl: true,
                            capsuleImageUrl: true,
                            libraryCapsuleUrl: true,
                            _count: { select: { achievements: true } },
                        },
                    },
                },
            }),
            prisma.userGameAchievement.groupBy({
                by: ["userGameId"],
                _max: { achievedAt: true },
                where: { userGame: { userId } },
            }),
        ]);

        const lastUnlockByUserGameId = new Map(
            latestUnlocks.map((u) => [u.userGameId, u._max.achievedAt]),
        );

        const games: AchievementGameProgress[] = userGames.map((ug) => {
            const total = ug.game._count.achievements;
            const unlocked = Math.min(ug._count.userGameAchievements, total);

            return {
                id: ug.game.id,
                name: ug.game.name,
                appId: ug.game.appId,
                headerImageUrl: ug.game.headerImageUrl,
                capsuleImageUrl: ug.game.capsuleImageUrl,
                libraryCapsuleUrl: ug.game.libraryCapsuleUrl,
                total,
                unlocked,
                percent: total > 0 ? Math.round((unlocked / total) * 100) : 0,
                lastUnlockAt: lastUnlockByUserGameId.get(ug.id)?.toISOString() ?? null,
            };
        });

        games.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));

        const totalAchievements = games.reduce((sum, g) => sum + g.total, 0);
        const totalUnlocked = games.reduce((sum, g) => sum + g.unlocked, 0);

        return {
            stats: {
                totalUnlocked,
                totalAchievements,
                averageCompletion: games.length > 0
                    ? Math.round(games.reduce((sum, g) => sum + g.percent, 0) / games.length)
                    : 0,
                perfectGames: games.filter((g) => g.total > 0 && g.unlocked >= g.total).length,
                gamesInProgress: games.filter((g) => g.unlocked > 0 && g.unlocked < g.total).length,
                gamesNotStarted: games.filter((g) => g.unlocked === 0).length,
            },
            games,
        };
    }, {
        namespace: "server.queries.achievements:getAchievementOverview",
    }));
