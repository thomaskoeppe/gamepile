"use server";

import { z } from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { queryClientWithAuth } from "@/server/query";

interface CollectionMemberUser {
    id: string;
    steamId: string;
    username: string;
    avatarUrl: string | null;
}

interface CollectionMemberData {
    owner: CollectionMemberUser;
    members: Array<{
        collectionUserId: string;
        user: CollectionMemberUser;
        addedBy: CollectionMemberUser;
        addedAt: Date;
        canModify: boolean;
    }>;
}

export const getCollectionMembers = queryClientWithAuth.inputSchema(z.object({
    collectionId: z.cuid(),
})).query<CollectionMemberData>(withLogging(async ({ parsedInput: { collectionId }, ctx }, { log }) => {
    log.info("Fetching collection members", {
        userId: ctx.user.id,
        collectionId,
    });

    const collection = await prisma.collection.findUniqueOrThrow({
        where: { id: collectionId },
        include: {
            createdBy: {
                select: { id: true, steamId: true, username: true, avatarUrl: true },
            },
            users: {
                include: {
                    user: {
                        select: { id: true, steamId: true, username: true, avatarUrl: true },
                    },
                    addedBy: {
                        select: { id: true, steamId: true, username: true, avatarUrl: true },
                    },
                },
            },
        },
    });

    return {
        owner: collection.createdBy,
        members: collection.users.map((cu) => ({
            collectionUserId: cu.id,
            user: cu.user,
            addedBy: cu.addedBy,
            addedAt: cu.addedAt,
            canModify: cu.canModify,
        })),
    };
}, {
    namespace: "server.queries.collection-members:getCollectionMembers",
}));
