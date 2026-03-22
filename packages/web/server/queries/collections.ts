"use server";

import {z} from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import {CollectionVisibility, Prisma} from "@/prisma/generated/client";
import {queryClientWithAuth} from "@/server/query";

/**
 * Fetches all collections visible to the authenticated user.
 * Includes public collections, collections the user owns, and collections
 * the user has been added to as a member.
 *
 * @returns Array of collection objects, each including the creator, members,
 *   the first 5 games (ordered by `addedAt` ascending), and a total game count.
 */
export const getCollections = queryClientWithAuth.query<Prisma.CollectionGetPayload<{
    include: {
        _count: { select: { games: true } },
        createdBy: true,
        users: { include: { user: true, }, },
        games: { take: 5, orderBy: { addedAt: 'asc', }, include: { game: { select: { appId: true, }, }, }, },
    }
}>[]>(withLogging(async ({ ctx }, { log }) => {
    log.info("Fetching collections for user", {
        userId: ctx.user.id,
    });

    return prisma.collection.findMany({
        include: {
            createdBy: true, users: {
                include: {
                    user: true,
                },
            }, games: {
                take: 5, orderBy: {
                    addedAt: 'asc' as const,
                }, include: {
                    game: {
                        select: {
                            appId: true,
                        },
                    },
                },
            }, _count: {
                select: {
                    games: true
                }
            }
        }, where: {
            OR: [{
                type: CollectionVisibility.PUBLIC
            }, {
                users: {
                    some: {
                        userId: ctx.user.id
                    }
                }
            }, {
                createdBy: {
                    id: ctx.user.id
                }
            }]
        }
    });
}, {
    namespace: "server.queries.collections:getCollections"
}));

/**
 * Fetches a single collection by ID that is accessible to the authenticated user.
 * Access is granted if the collection is public, owned by the user, or the user
 * has been explicitly added as a member.
 *
 * @param parsedInput.collectionId - The CUID of the collection to fetch.
 * @returns The collection object including the creator and members, or `null` if
 *   the collection does not exist or the user does not have access.
 */
export const getCollection = queryClientWithAuth.inputSchema(z.object({ collectionId: z.cuid() })).query<Prisma.CollectionGetPayload<{
    include: { createdBy: true, users: { include: { user: true } } }
}> | null>(withLogging(async ({ parsedInput: { collectionId }, ctx }, { log }) => {
    log.info("Fetching collection for user", {
        userId: ctx.user.id,
        collectionId
    });

    return prisma.collection.findFirst({
        where: {
            id: collectionId,
            OR: [{
                type: CollectionVisibility.PUBLIC
            }, {
                users: {
                    some: {
                        userId: ctx.user.id
                    }
                }
            }, {
                createdBy: {
                    id: ctx.user.id
                }
            }]
        }, include: {
            createdBy: true, users: {
                include: {
                    user: true,
                },
            }
        }
    });
}, {
    namespace: "server.queries.collections:getCollection"
}));