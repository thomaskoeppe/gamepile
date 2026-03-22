"use server";

import {z} from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import {getInvitePrivacyFilter, INVITE_RESOURCE_TYPES} from "@/server/lib/invite-privacy";
import {queryClientWithAuth} from "@/server/query";

export const getInvitableUsers = queryClientWithAuth.inputSchema(z.object({
    resourceType: z.enum(INVITE_RESOURCE_TYPES),
})).query<Array<{ id: string; steamId: string; username: string; avatarUrl: string | null }>>(withLogging(async ({ parsedInput: { resourceType }, ctx }, { log }) => {
    log.info("Fetching invitable users", {
        userId: ctx.user.id,
        resourceType,
    });

    return prisma.user.findMany({
        where: {
            id: { not: ctx.user.id },
            ...getInvitePrivacyFilter(resourceType),
        },
        orderBy: { username: "asc" },
        select: {
            id: true,
            steamId: true,
            username: true,
            avatarUrl: true,
        }
    });
}, {
    namespace: "server.queries.vault-users:getInvitableUsers",
}));