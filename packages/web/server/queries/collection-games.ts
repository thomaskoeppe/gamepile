"use server";

import {z} from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { Prisma } from "@/prisma/generated/client";
import {queryClientWithAuth} from "@/server/query";

/**
 * Fetches all collections that the authenticated user can modify (owned or granted
 * `canModify` membership), annotated with whether the specified game is already a
 * member of each collection.
 *
 * @param parsedInput.gameId - The UUID of the game to check membership for.
 * @returns Array of objects with `id`, `name`, and `isMember` flag for each
 *   modifiable collection. Returns an empty array if the user has no modifiable collections.
 */
export const getCollectionsForGame = queryClientWithAuth.inputSchema(z.object({ gameId: z.uuid() })).query<Array<{ id: string; name: string; isMember: boolean; }>>(withLogging(async ({ parsedInput: { gameId }, ctx }, { log }) => {
    log.info("Fetching collections for game", {
        gameId, userId: ctx.user.id,
    });

    const collections = await prisma.collection.findMany({
        where: {
            OR: [
                { createdById: ctx.user.id },
                { users: { some: { userId: ctx.user.id, canModify: true } } },
            ],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
    });

    if (collections.length === 0) return [];

    const memberships = await prisma.collectionGame.findMany({
        where: { gameId, collectionId: { in: collections.map((c) => c.id) } },
        select: { collectionId: true },
    });

    const memberSet = new Set(memberships.map((m) => m.collectionId));

    return collections.map((c) => ({
        id: c.id,
        name: c.name,
        isMember: memberSet.has(c.id),
    }));
}, {
    namespace: "server.queries.collection-games:getCollectionsForGame",
}));

/**
 * Fetches all games belonging to a collection, enriched with the authenticated
 * user's playtime and ownership data where available.
 *
 * @param parsedInput.collectionId - The CUID of the collection to fetch games for.
 * @returns Array of game objects (including categories and genres) augmented with
 *   `playtime` (minutes), and an `owned` flag indicating whether
 *   the game is in the user's Steam library.
 */
export const getGamesForCollection = queryClientWithAuth.inputSchema(z.object({ collectionId: z.cuid() })).query<Array<Prisma.GameGetPayload<{ include: { categories: true, genres: true } }> & { playtime?: number; owned: boolean }>>(withLogging(async ({ parsedInput: { collectionId }, ctx }, { log })  => {
    log.info("Fetching games for collection", {
        collectionId, userId: ctx.user.id,
    });

    const collectionGames = await prisma.collectionGame.findMany({
        where: {
            collectionId
        },
        include: {
            game: {
                include: {
                    categories: true,
                    genres: true,
                }
            }
        }
    });

    const ownedGames = await prisma.userGame.findMany({
        where: {
            userId: ctx.user.id,
            gameId: { in: collectionGames.map((cg) => cg.game.id) },
        },
    });

    const ownedMap = new Map(
        ownedGames.map((ug) => [ug.gameId, ug])
    );

    return collectionGames.map((collectionGame) => {
        const userGame = ownedMap.get(collectionGame.game.id);
        return {
            ...collectionGame.game,
            playtime: userGame?.playtime,
            owned: !!userGame,
        };
    });
}, {
    namespace: "server.queries.collection-games:getGamesForCollection"
}));