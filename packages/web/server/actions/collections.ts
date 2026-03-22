"use server";

import {z} from "zod";

import {getSetting} from "@/lib/app-settings";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import {AppSettingKey, CollectionVisibility} from "@/prisma/generated/enums";
import {actionClientWithAuth} from "@/server/actions";

/**
 * Creates a new collection for the authenticated user.
 *
 * @param input.name - Collection name (5–25 characters).
 * @param input.description - Collection description (20–100 characters).
 * @param input.type - Visibility type: PUBLIC or PRIVATE.
 * @returns Success flag, message, and the created collection's `id` and `name`.
 */
export const createCollection = actionClientWithAuth.inputSchema(z.object({
    name: z.string().min(5).max(25),
    description: z.string().min(20).max(100),
    type: z.enum(CollectionVisibility)
})).action(withLogging(async ({parsedInput: {name, description, type}, ctx}, {log}) => {
    log.info("Creating collection", {
        name, description, type, userId: ctx.user.id,
    });

    if (type === CollectionVisibility.PUBLIC) {
        if (!getSetting(AppSettingKey.ALLOW_PUBLIC_COLLECTIONS)) {
            return { success: false, message: "Public collections are disabled by the administrator." };
        }
    }

    const collection = await prisma.collection.create({
        data: { name, description, type: type, createdBy: { connect: { id: ctx.user.id } } }
    });

    return { success: true, message: "Collection created.", data: { id: collection.id, name: collection.name } };
}, {
    namespace: "server.actions.collections:createCollection",
}));

/**
 * Renames an existing collection owned by the authenticated user.
 *
 * @param input.collectionId - ID of the collection to rename.
 * @param input.name - New collection name (5–25 characters).
 * @param input.description - Optional new description (20–100 characters).
 * @returns `{ success: true }` on success.
 * @throws {Error} If the collection is not found or the user does not own it.
 */
export const renameCollection = actionClientWithAuth.inputSchema(z.object({
    collectionId: z.string().min(1),
    name: z.string().min(5).max(25),
    description: z.string().min(20).max(100).optional(),
})).action(withLogging(async ({ parsedInput: { collectionId, name, description }, ctx }, { log }) => {
    log.info("Renaming collection", { userId: ctx.user.id, collectionId, name });

    const collection = await prisma.collection.findFirst({
        where: { id: collectionId, createdById: ctx.user.id },
        select: { id: true, description: true },
    });

    if (!collection) throw new Error("Collection not found or you do not have permission to rename it.");

    await prisma.collection.update({
        where: { id: collectionId },
        data: { name, description },
    });

    return { success: true };
}, {
    namespace: "server.actions.collections:renameCollection",
}));

/**
 * Deletes a collection owned by the authenticated user.
 *
 * @param input.collectionId - ID of the collection to delete.
 * @returns `{ success: true }` on success.
 * @throws {Error} If the collection is not found or the user does not own it.
 */
export const deleteCollection = actionClientWithAuth.inputSchema(z.object({
    collectionId: z.string().min(1),
})).action(withLogging(async ({ parsedInput: { collectionId }, ctx }, { log }) => {
    log.info("Deleting collection", { userId: ctx.user.id, collectionId });

    const collection = await prisma.collection.findFirst({
        where: { id: collectionId, createdById: ctx.user.id },
        select: { id: true },
    });

    if (!collection) throw new Error("Collection not found or you do not have permission to delete it.");

    await prisma.collection.delete({ where: { id: collectionId } });

    return { success: true };
}, {
    namespace: "server.actions.collections:deleteCollection",
}));