"use server";

import { z } from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { VaultShareMode, VaultShareRequestStatus } from "@/prisma/generated/enums";
import { queryClientWithAuth } from "@/server/query";

type SharePublicUser = { id: string; username: string; avatarUrl: string | null };

export type VaultShareSummary = {
    id: string;
    mode: VaultShareMode;
    enabled: boolean;
    maxKeys: number | null;
    requiresPassphrase: boolean;
    gameCount: number;
    createdAt: Date;
    recipients: Array<{ recipientId: string; user: SharePublicUser | null; createdAt: Date }>;
    links: Array<{ id: string; token: string; maxUses: number | null; expiresAt: Date | null; usedCount: number; createdAt: Date }>;
    pendingRequestCount: number;
};

/** Confirms the user may manage shares for a vault (owner or `canShare` member). */
async function canManageVaultShares(vaultId: string, userId: string): Promise<boolean> {
    const vault = await prisma.keyVault.findFirst({
        where: {
            id: vaultId,
            OR: [{ createdById: userId }, { users: { some: { userId, canShare: true } } }],
        },
        select: { id: true },
    });
    return vault !== null;
}

/** Owner/sharer view: all shares configured on a vault. Sensitive crypto fields are never returned. */
export const getVaultShares = queryClientWithAuth.inputSchema(z.object({
    vaultId: z.cuid(),
})).query<VaultShareSummary[]>(withLogging(async ({ parsedInput: { vaultId }, ctx }, { log }) => {
    log.info("Fetching vault shares", { userId: ctx.user.id, vaultId });

    if (!(await canManageVaultShares(vaultId, ctx.user.id))) {
        return [];
    }

    const shares = await prisma.vaultShare.findMany({
        where: { keyVaultId: vaultId },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            mode: true,
            enabled: true,
            maxKeys: true,
            authHash: true,
            createdAt: true,
            _count: { select: { games: true } },
            recipients: {
                select: {
                    id: true,
                    createdAt: true,
                    user: { select: { id: true, username: true, avatarUrl: true } },
                },
            },
            links: {
                select: {
                    id: true,
                    token: true,
                    maxUses: true,
                    expiresAt: true,
                    createdAt: true,
                    _count: { select: { usages: true } },
                },
            },
            requests: { where: { status: VaultShareRequestStatus.PENDING }, select: { id: true } },
        },
    });

    return shares.map((share) => ({
        id: share.id,
        mode: share.mode,
        enabled: share.enabled,
        maxKeys: share.maxKeys,
        requiresPassphrase: share.authHash !== null,
        gameCount: share._count.games,
        createdAt: share.createdAt,
        recipients: share.recipients.map((r) => ({ recipientId: r.id, user: r.user, createdAt: r.createdAt })),
        links: share.links.map((l) => ({
            id: l.id,
            token: l.token,
            maxUses: l.maxUses,
            expiresAt: l.expiresAt,
            usedCount: l._count.usages,
            createdAt: l.createdAt,
        })),
        pendingRequestCount: share.requests.length,
    }));
}, {
    namespace: "server.queries.vault-shares:getVaultShares",
}));

export type SharedWithMeEntry = {
    shareId: string;
    mode: VaultShareMode;
    vaultName: string;
    owner: SharePublicUser;
    gameCount: number;
};

/** Recipient view: every share the current user has been granted access to. */
export const getSharedWithMe = queryClientWithAuth.query<SharedWithMeEntry[]>(withLogging(async ({ ctx }, { log }) => {
    log.info("Fetching shares for recipient", { userId: ctx.user.id });

    const shares = await prisma.vaultShare.findMany({
        where: { enabled: true, recipients: { some: { userId: ctx.user.id } } },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            mode: true,
            _count: { select: { games: true } },
            keyVault: { select: { name: true, createdBy: { select: { id: true, username: true, avatarUrl: true } } } },
        },
    });

    return shares.map((share) => ({
        shareId: share.id,
        mode: share.mode,
        vaultName: share.keyVault.name,
        owner: share.keyVault.createdBy,
        gameCount: share._count.games,
    }));
}, {
    namespace: "server.queries.vault-shares:getSharedWithMe",
}));

export type ShareGameView = {
    keyVaultGameId: string;
    name: string;
    redeemed: boolean;
    redeemedByMe: boolean;
    requestId: string | null;
    requestStatus: VaultShareRequestStatus | null;
};

export type ShareRecipientView = {
    shareId: string;
    mode: VaultShareMode;
    vaultName: string;
    requiresPassphrase: boolean;
    maxKeys: number | null;
    games: ShareGameView[];
};

/** Recipient view of a single share: claimable games with status. Keys are never returned. */
export const getShareForRecipient = queryClientWithAuth.inputSchema(z.object({
    shareId: z.cuid(),
})).query<ShareRecipientView | null>(withLogging(async ({ parsedInput: { shareId }, ctx }, { log }) => {
    log.info("Fetching share for recipient", { userId: ctx.user.id, shareId });

    const share = await prisma.vaultShare.findFirst({
        where: { id: shareId, enabled: true, recipients: { some: { userId: ctx.user.id } } },
        select: {
            id: true,
            mode: true,
            maxKeys: true,
            authHash: true,
            keyVaultId: true,
            keyVault: { select: { name: true } },
            games: { select: { keyVaultGameId: true } },
            requests: {
                where: { requestedById: ctx.user.id },
                select: { id: true, keyVaultGameId: true, status: true },
            },
        },
    });

    if (!share) return null;

    const poolIds = share.games.map((g) => g.keyVaultGameId);
    const keys = await prisma.keyVaultGame.findMany({
        where: poolIds.length > 0 ? { id: { in: poolIds } } : { keyVaultId: share.keyVaultId },
        select: {
            id: true,
            originalName: true,
            redeemed: true,
            redeemedById: true,
            game: { select: { name: true } },
        },
        orderBy: { addedAt: "asc" },
    });

    const requestByGame = new Map(share.requests.map((r) => [r.keyVaultGameId, r]));

    return {
        shareId: share.id,
        mode: share.mode,
        vaultName: share.keyVault.name,
        requiresPassphrase: share.authHash !== null,
        maxKeys: share.maxKeys,
        games: keys.map((k) => {
            const request = requestByGame.get(k.id);
            return {
                keyVaultGameId: k.id,
                name: k.game?.name ?? k.originalName,
                redeemed: k.redeemed,
                redeemedByMe: k.redeemedById === ctx.user.id,
                requestId: request?.id ?? null,
                requestStatus: request?.status ?? null,
            };
        }),
    };
}, {
    namespace: "server.queries.vault-shares:getShareForRecipient",
}));

export type ShareRequestView = {
    requestId: string;
    shareId: string;
    gameName: string;
    requestedBy: SharePublicUser;
    createdAt: Date;
};

/** Owner/sharer view: pending key requests across all of a vault's shares. */
export const getShareRequests = queryClientWithAuth.inputSchema(z.object({
    vaultId: z.cuid(),
})).query<ShareRequestView[]>(withLogging(async ({ parsedInput: { vaultId }, ctx }, { log }) => {
    log.info("Fetching share requests", { userId: ctx.user.id, vaultId });

    if (!(await canManageVaultShares(vaultId, ctx.user.id))) {
        return [];
    }

    const requests = await prisma.vaultShareRequest.findMany({
        where: { status: VaultShareRequestStatus.PENDING, share: { keyVaultId: vaultId } },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            shareId: true,
            createdAt: true,
            requestedBy: { select: { id: true, username: true, avatarUrl: true } },
            keyVaultGame: { select: { originalName: true, game: { select: { name: true } } } },
        },
    });

    return requests.map((r) => ({
        requestId: r.id,
        shareId: r.shareId,
        gameName: r.keyVaultGame.game?.name ?? r.keyVaultGame.originalName,
        requestedBy: r.requestedBy,
        createdAt: r.createdAt,
    }));
}, {
    namespace: "server.queries.vault-shares:getShareRequests",
}));
