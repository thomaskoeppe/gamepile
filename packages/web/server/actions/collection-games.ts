"use server";

import {z} from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import {actionClientWithAuth} from "@/server/actions";

/**
 * Returns true if the authenticated user may modify games in the given collection.
 * The user must be the collection owner or an explicit member with `canModify`.
 */
async function assertCanModifyCollection(collectionId: string, userId: string): Promise<void> {
    const collection = await prisma.collection.findUnique({
        where: { id: collectionId },
        select: {
            createdById: true,
            users: {
                where: { userId, canModify: true },
                select: { id: true },
            },
        },
    });

    if (!collection) throw new Error("Collection not found or access denied.");

    const isOwner = collection.createdById === userId;
    const hasModifyPermission = collection.users.length > 0;

    if (!isOwner && !hasModifyPermission) {
        throw new Error("Collection not found or access denied.");
    }
}

/**
 * Adds a game to a collection.
 *
 * @param input.collectionId - CUID of the collection.
 * @param input.gameId - UUID of the game to add.
 * @returns `true` on success.
 * @throws {Error} If the collection is not found or the user does not have modify access.
 */
export const addGameToCollection = actionClientWithAuth.inputSchema(z.object({
    collectionId: z.cuid(), gameId: z.uuid(),
})).action(withLogging(async ({parsedInput: {collectionId, gameId}, ctx}, {log}) => {
    log.info("Adding game to collection", {
        collectionId, gameId, userId: ctx.user.id,
    });

    await assertCanModifyCollection(collectionId, ctx.user.id);

    await prisma.collectionGame.create({
        data: {
            collectionId, gameId, addedById: ctx.user.id
        },
    });

    return true;
}, {
    namespace: "server.actions.collection-games:addGameToCollection"
}));

/**
 * Removes a game from a collection.
 *
 * @param input.collectionId - CUID of the collection.
 * @param input.gameId - UUID of the game to remove.
 * @returns `true` on success.
 * @throws {Error} If the collection is not found or the user does not have modify access.
 */
export const removeGameFromCollection = actionClientWithAuth.inputSchema(z.object({
    collectionId: z.cuid(), gameId: z.uuid(),
})).action(withLogging(async ({parsedInput: {collectionId, gameId}, ctx}, {log}) => {
    log.info("Removing game from collection", {
        collectionId, gameId, userId: ctx.user.id,
    });

    await assertCanModifyCollection(collectionId, ctx.user.id);

    await prisma.collectionGame.delete({
        where: {
            collectionId_gameId: {
                collectionId, gameId,
            },
        },
    });

    return true;
}, {
    namespace: "server.actions.collection-games:removeGameFromCollection"
}));

/**
 * Toggles a game's membership in a collection.
 *
 * @param input.collectionId - CUID of the collection.
 * @param input.gameId - UUID of the game to toggle.
 * @param input.isMember - `true` if the game is currently a member (it will be removed); `false` to add it.
 * @returns The `collectionId` and the new `isMember` state after the toggle.
 * @throws {Error} If the collection is not found or the user does not have modify access.
 */
export const toggleGameInCollection = actionClientWithAuth.inputSchema(z.object({
    collectionId: z.cuid(),
    gameId: z.uuid(),
    isMember: z.boolean(),
})).action(withLogging(async ({ parsedInput: { collectionId, gameId, isMember }, ctx }, { log }) => {
    log.info("Toggling game in collection", { collectionId, gameId, isMember, userId: ctx.user.id });

    await assertCanModifyCollection(collectionId, ctx.user.id);

    if (isMember) {
        await prisma.collectionGame.delete({
            where: { collectionId_gameId: { collectionId, gameId } },
        });
    } else {
        await prisma.collectionGame.create({
            data: { collectionId, gameId, addedById: ctx.user.id },
        });
    }

    return { collectionId, isMember: !isMember };
}, {
    namespace: "server.actions.collections:toggleGameInCollection"
}));
