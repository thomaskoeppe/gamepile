"use server";

import {z} from "zod";

import prisma from "@/lib/prisma";
import {redis} from "@/lib/redis";
import { withLogging } from "@/lib/with-logging";
import {queryClientWithAuth} from "@/server/query";
import {SteamAppDetails} from "@/types/steam";

/**
 * Fetches the names of all game categories stored in the database.
 *
 * @returns Array of category name strings drawn from the full `Category` table.
 */
export const getGameCategories = queryClientWithAuth.query<Array<string>>(withLogging(async ({ ctx }, { log }) => {
    log.info("Fetching categories for game", {
        userId: ctx.user.id,
    });

    const categories = await prisma.category.findMany({
        select: {
            name: true
        }
    });

    return categories.map(c => c.name);
}, {
    namespace: "server.queries.games:getGameCategories"
}));

/**
 * Fetches the names of all game genres stored in the database.
 *
 * @returns Array of genre name strings drawn from the full `Genre` table.
 */
export const getGameGenres = queryClientWithAuth.query<Array<string>>(withLogging(async ({ ctx }, { log }) => {
    log.info("Fetching genres for game", {
        userId: ctx.user.id,
    });

    const genres = await prisma.genre.findMany({
        select: {
            name: true
        }
    });

    return genres.map(g => g.name);
}, {
    namespace: "server.queries.games:getGameGenres"
}));

export const getGameDetails = queryClientWithAuth.inputSchema(z.object({
    gameId: z.uuid()
})).query<SteamAppDetails | null>(withLogging(async ({ parsedInput: { gameId }, ctx }, { log }) => {
    log.info("Fetching details for game", {
        userId: ctx.user.id,
        gameId
    });

    const redisKey = `gameDetails:${gameId}`;
    const cachedData = await redis.get(redisKey);
    if (cachedData) {
        log.info("Cache hit for game details", { gameId });
        return JSON.parse(cachedData) as SteamAppDetails;
    }

    const game = await prisma.game.findUnique({
        where: {
            id: gameId
        },
        select: {
            appId: true
        }
    });

    if (!game || !game.appId) throw new Error("No game found.");

    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${game.appId}&l=en`, {
        headers: {
            "Accept": "application/json",
        }
    });

    if (!response.ok) throw new Error("Failed to fetch game details from Steam API.");

    const data = await response.json() as { [key: string]: { success: boolean; data?: SteamAppDetails } };
    const gameData = data[game.appId.toString()];

    if (gameData?.success && gameData.data) {
        redis.set(redisKey, JSON.stringify(gameData.data), "EX", 60 * 60 * 12);

        return gameData.data as SteamAppDetails;
    }

    return null;
}, {
    namespace: "server.queries.games:getGameDetails"
}));