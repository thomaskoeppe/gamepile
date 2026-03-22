"use server";

import { z } from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { actionClientWithAuth } from "@/server/actions";
import { allowsInviteForResource, getInvitePrivacyErrorMessage } from "@/server/lib/invite-privacy";

/**
 * Adds a user as a member of a collection.
 *
 * @param input.collectionId - CUID of the collection.
 * @param input.userId - CUID of the user to add.
 * @returns `true` on success.
 * @throws {Error} If the authenticated user is not the collection owner.
 */
export const addUserToCollection = actionClientWithAuth.inputSchema(z.object({
    collectionId: z.cuid(),
    userId: z.cuid(),
})).action<boolean>(withLogging(async ({ parsedInput: { collectionId, userId }, ctx }, { log }) => {
    log.info("Adding user to collection", {
        userId: ctx.user.id,
        collectionId,
        addedUserId: userId,
    });

    const collection = await prisma.collection.findUniqueOrThrow({
        where: { id: collectionId },
        select: { createdById: true },
    });

    if (collection.createdById !== ctx.user.id) {
        throw new Error("Only the collection owner can add members.");
    }

    if (userId === ctx.user.id) {
        throw new Error("The collection owner is already part of this collection.");
    }

    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            settings: {
                select: {
                    privacyAllowVaultInvites: true,
                    privacyAllowCollectionInvites: true,
                },
            },
        },
    });

    if (!targetUser) {
        throw new Error("User not found.");
    }

    if (!allowsInviteForResource(targetUser.settings, "collection")) {
        throw new Error(getInvitePrivacyErrorMessage("collection"));
    }

    const existingMember = await prisma.collectionUser.findUnique({
        where: {
            collectionId_userId: {
                collectionId,
                userId,
            },
        },
        select: { id: true },
    });

    if (existingMember) {
        throw new Error("This user is already a collection member.");
    }

    await prisma.collectionUser.create({
        data: {
            collectionId,
            userId,
            addedById: ctx.user.id,
        },
    });

    return true;
}, {
    namespace: "server.actions.collection-members:addUserToCollection",
}));

/**
 * Removes a user from a collection's member list.
 *
 * @param input.collectionUserId - CUID of the `CollectionUser` membership record to delete.
 * @returns `true` on success.
 * @throws {Error} If the authenticated user is not the collection owner.
 */
export const removeUserFromCollection = actionClientWithAuth.inputSchema(z.object({
    collectionUserId: z.cuid(),
})).action<boolean>(withLogging(async ({ parsedInput: { collectionUserId }, ctx }, { log }) => {
    log.info("Removing user from collection", {
        userId: ctx.user.id,
        collectionUserId,
    });

    const collectionUser = await prisma.collectionUser.findUniqueOrThrow({
        where: { id: collectionUserId },
        include: { collection: { select: { createdById: true } } },
    });

    if (collectionUser.collection.createdById !== ctx.user.id) {
        throw new Error("Only the collection owner can remove members.");
    }

    await prisma.collectionUser.delete({
        where: { id: collectionUserId },
    });

    return true;
}, {
    namespace: "server.actions.collection-members:removeUserFromCollection",
}));
