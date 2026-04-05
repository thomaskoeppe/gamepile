"use server";

import {z} from "zod";

import prisma from "@/lib/prisma";
import {withLogging} from "@/lib/with-logging";
import {queryClientWithAuth} from "@/server/query";
import type {GameDetails} from "@/types/game";

/**
 * Fetches the names of all game categories stored in the database.
 *
 * @returns Array of category name strings drawn from the full `Category` table.
 */
export const getGameCategories = queryClientWithAuth.query<Array<string>>(withLogging(async ({ctx}, {log}) => {
    log.info("Fetching categories for game", {userId: ctx.user.id});

    const categories = await prisma.category.findMany({select: {name: true}});
    return categories.map(c => c.name);
}, {
    namespace: "server.queries.games:getGameCategories"
}));


/**
 * Fetches the names of all game tags stored in the database.
 *
 * @returns Array of tag name strings drawn from the full `Tag` table.
 */
export const getGameTags = queryClientWithAuth.query<Array<string>>(withLogging(async ({ctx}, {log}) => {
    log.info("Fetching tags for game", {userId: ctx.user.id});

    const tags = await prisma.tag.findMany({select: {name: true}});
    return tags.map(t => t.name);
}, {
    namespace: "server.queries.games:getGameTags"
}));

/**
 * Fetches full game details from the database, including all relations
 * (categories, tags, screenshots, videos, and highlighted achievements).
 *
 * Replaces the previous implementation that fetched from the Steam Store API.
 *
 * @returns Game details with all relations, or `null` if not found.
 */
export const getGameDetails = queryClientWithAuth.inputSchema(z.object({
    gameId: z.uuid(),
})).query<GameDetails | null>(withLogging(async ({parsedInput: {gameId}, ctx}, {log}) => {
    log.info("Fetching details for game", {userId: ctx.user.id, gameId});

    const game = await prisma.game.findUnique({
        where: {id: gameId},
        include: {
            categories: {select: {id: true, name: true}},
            tags: {select: {id: true, name: true}},
            screenshots: {select: {id: true, url: true}, orderBy: {createdAt: "asc"}},
            videos: {select: {id: true, url: true, title: true}, orderBy: {createdAt: "asc"}},
            achievements: {select: {id: true, displayName: true, icon: true}, take: 6},
            _count: {select: {achievements: true}},
        },
    });

    if (!game) {
        log.warn("Game not found", {gameId});
        return null;
    }

    return game;
}, {
    namespace: "server.queries.games:getGameDetails"
}));