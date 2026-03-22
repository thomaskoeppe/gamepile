"use server";

import {z} from "zod";

import {requireVaultAccess} from "@/lib/auth/vault/auth";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import type {Prisma} from "@/prisma/generated/browser";
import {KeyVaultAuthType} from "@/prisma/generated/enums";
import {queryClientWithAuth} from "@/server/query";

/**
 * Fetches all vaults accessible to the authenticated user (owned or shared).
 *
 * @returns Array of vault objects with game and user counts, excluding sensitive
 *   auth fields (`authHash`, `authSalt`).
 */
export const getVaults = queryClientWithAuth.query<Array<Prisma.KeyVaultGetPayload<{ include: { _count: { select: { games: true; users: true } } }, omit: { authHash: true, authSalt: true } }>>>(withLogging(async ({ ctx }, { log }) => {
    log.info("Fetching vaults for user", {
        userId: ctx.user.id,
    });

    return prisma.keyVault.findMany({
        where: {
            'OR': [
                { createdById: ctx.user.id },
                {
                    users: {
                        some: {
                            userId: ctx.user.id
                        }
                    }
                }
            ]
        },
        include: {
            _count: {
                select: {
                    games: true,
                    users: true
                }
            }
        },
        omit: {
            authHash: true,
            authSalt: true
        }
    });
}, {
    namespace: "server.queries.vaults:getVaults"
}));

export type VaultDetailData = {
    id: string;
    name: string;
    authType: KeyVaultAuthType;
    createdAt: Date;
    updatedAt: Date;
    createdBy: { id: string; steamId: string; username: string; avatarUrl: string | null };
    games: Array<{ id: string; redeemed: boolean }>;
    users: Array<{
        keyVaultUserId: string;
        user: { id: string; steamId: string; username: string; avatarUrl: string | null };
        addedBy: { id: string; steamId: string; username: string; avatarUrl: string | null };
        addedAt: Date;
        canRedeem: boolean;
        canCreate: boolean;
    }>;
};

/**
 * Fetches the full detail of a single vault by ID, including its keys and members.
 * The user must be the vault owner or an invited member to retrieve it.
 *
 * @param parsedInput.vaultId - The ID of the vault to retrieve.
 * @returns The full `VaultDetailData` object, or `null` if the vault does not exist
 *   or the user does not have access.
 */
export const getVaultDetail = queryClientWithAuth.inputSchema(z.object({
    vaultId: z.string().min(1),
})).query<VaultDetailData | null>(withLogging(async ({ parsedInput: { vaultId }, ctx }, { log }) => {
    log.info("Fetching vault detail", { userId: ctx.user.id, vaultId });

    const vault = await prisma.keyVault.findFirst({
        where: {
            AND: [
                {id: vaultId},
                {
                    OR: [
                        {createdById: ctx.user.id},
                        {users: {some: {userId: ctx.user.id}}},
                    ],
                },
            ],
        },
        include: {
            users: {
                include: {
                    user: {
                        select: {id: true, steamId: true, username: true, avatarUrl: true},
                    },
                    addedBy: {
                        select: {id: true, steamId: true, username: true, avatarUrl: true},
                    },
                },
            },
            createdBy: {
                select: {id: true, steamId: true, username: true, avatarUrl: true},
            },
            games: {
                select: {id: true, redeemed: true},
            },
        },
        omit: {
            authHash: true,
            authSalt: true,
            createdById: true,
        },
    });

    if (!vault) {
        return null;
    }

    return {
        ...vault,
        users: vault.users.map((member) => ({
            keyVaultUserId: member.id,
            user: member.user,
            addedBy: member.addedBy,
            addedAt: member.addedAt,
            canRedeem: member.canRedeem,
            canCreate: member.canCreate,
        })),
    };
}, {
    namespace: "server.queries.vaults:getVaultDetail",
}));

type VaultAccessStatus = {
    hasAccess: boolean;
    authType: KeyVaultAuthType;
    vaultName: string;
};

/**
 * Checks whether the authenticated user has valid access to a specific vault.
 * - If the vault does not exist or the user is not an owner/member, `hasAccess` is `false`.
 * - If the vault `authType` is `NONE`, access is unconditionally granted.
 * - If the vault `authType` is `PIN` or `PASSWORD`, the vault access cookie is validated.
 *
 * @param parsedInput.vaultId - The ID of the vault to check.
 * @returns A `VaultAccessStatus` object containing `hasAccess`, `authType`, and `vaultName`.
 */
export const checkVaultAccess = queryClientWithAuth.inputSchema(z.object({
    vaultId: z.string().min(1),
})).query<VaultAccessStatus>(withLogging(async ({ parsedInput: { vaultId }, ctx }, { log }) => {
    log.info("Checking vault access", { userId: ctx.user.id, vaultId });

    const vault = await prisma.keyVault.findFirst({
        where: {
            id: vaultId,
            OR: [
                { createdById: ctx.user.id },
                { users: { some: { userId: ctx.user.id } } },
            ],
        },
        select: { authType: true, name: true },
    });

    if (!vault) {
        return { hasAccess: false, authType: KeyVaultAuthType.NONE, vaultName: "" };
    }

    if (vault.authType === KeyVaultAuthType.NONE) {
        return { hasAccess: true, authType: vault.authType, vaultName: vault.name };
    }

    const hasAccess = await requireVaultAccess(vaultId);
    return { hasAccess, authType: vault.authType, vaultName: vault.name };
}, {
    namespace: "server.queries.vaults:checkVaultAccess",
}));
