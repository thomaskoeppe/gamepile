"use server";

import {z} from "zod";

import {getSetting} from "@/lib/app-settings";
import prisma from "@/lib/prisma";
import { getSlugError, normalizeSlug } from "@/lib/slug";
import { withLogging } from "@/lib/with-logging";
import { Prisma } from "@/prisma/generated/client";
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

    const maxCollectionsPerUser = getSetting(AppSettingKey.MAX_COLLECTIONS_PER_USER);
    const existingCollections = await prisma.collection.count({
        where: { createdById: ctx.user.id },
    });

    if (existingCollections >= maxCollectionsPerUser) {
        return {
            success: false,
            message: `Collection limit reached (${maxCollectionsPerUser}).`,
        };
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
 * Sets or clears the custom URL slug for a collection owned by the authenticated user (#11).
 *
 * Passing an empty string clears the slug. Slugs are validated against the shared
 * rules in `lib/slug.ts` and must be globally unique.
 *
 * @param input.collectionId - ID of the collection to update.
 * @param input.slug - The desired slug, or an empty string to clear it.
 * @returns `{ success: true, slug }` with the stored slug (or `null` when cleared).
 */
export const setCollectionSlug = actionClientWithAuth.inputSchema(z.object({
    collectionId: z.string().min(1),
    slug: z.string().max(64),
})).action(withLogging(async ({ parsedInput: { collectionId, slug }, ctx }, { log }) => {
    const normalized = normalizeSlug(slug);
    log.info("Setting collection slug", { userId: ctx.user.id, collectionId, slug: normalized });

    if (normalized.length > 0) {
        const error = getSlugError(normalized);
        if (error) throw new Error(error);
    }

    const collection = await prisma.collection.findFirst({
        where: { id: collectionId, createdById: ctx.user.id },
        select: { id: true },
    });

    if (!collection) throw new Error("Collection not found or you do not have permission to edit it.");

    try {
        await prisma.collection.update({
            where: { id: collectionId },
            data: { slug: normalized.length > 0 ? normalized : null },
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new Error("That URL is already taken.");
        }

        throw error;
    }

    return { success: true, slug: normalized.length > 0 ? normalized : null };
}, {
    namespace: "server.actions.collections:setCollectionSlug",
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