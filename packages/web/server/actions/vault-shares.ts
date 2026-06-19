"use server";

import { randomBytes } from "crypto";

import { z } from "zod";

import { getSetting } from "@/lib/app-settings";
import { decryptGameKey } from "@/lib/auth/crypto";
import { unwrapVaultKeyFromVault } from "@/lib/auth/vault/key-access";
import { assertNotLockedOut, clearLockout, registerFailedAttempt } from "@/lib/auth/vault/lockout";
import { createSharePassphraseMaterial, unwrapShareVaultKey } from "@/lib/auth/vault/share-key";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { Prisma } from "@/prisma/generated/client";
import { AppSettingKey, VaultShareMode, VaultShareRequestStatus } from "@/prisma/generated/enums";
import { actionClientWithAuth } from "@/server/actions";
import { allowsInviteForResource, getInvitePrivacyErrorMessage } from "@/server/lib/invite-privacy";

const passphraseSchema = z.string().min(6).max(128);

/** Throws when an admin has globally disabled vault sharing. */
function assertSharingEnabled(): void {
    if (getSetting(AppSettingKey.DISABLE_VAULT_SHARING)) {
        throw new Error("Vault sharing is disabled by the administrator.");
    }
}

/** Loads a vault (with auth material) only if the user may share it (owner or `canShare` member). */
async function loadShareableVault(vaultId: string, userId: string) {
    const vault = await prisma.keyVault.findFirst({
        where: {
            id: vaultId,
            OR: [
                { createdById: userId },
                { users: { some: { userId, canShare: true } } },
            ],
        },
        select: {
            id: true,
            authType: true,
            authHash: true,
            authSalt: true,
            keySalt: true,
            encryptedVaultKey: true,
        },
    });

    if (!vault) throw new Error("Vault not found or you do not have permission to share it.");
    return vault;
}

/** Loads a share only if the user may manage it (vault owner or `canShare` member). */
async function loadManagedShare(shareId: string, userId: string) {
    const share = await prisma.vaultShare.findUnique({
        where: { id: shareId },
        include: {
            keyVault: {
                select: {
                    id: true,
                    createdById: true,
                    users: { where: { userId }, select: { canShare: true } },
                },
            },
        },
    });

    if (!share) throw new Error("Share not found.");

    const isOwner = share.keyVault.createdById === userId;
    const canManage = isOwner || share.keyVault.users.some((u) => u.canShare);
    if (!canManage) throw new Error("You do not have permission to manage this share.");

    return share;
}

/** Verifies that the given key entries all belong to the vault. */
async function assertKeysBelongToVault(keyVaultGameIds: string[], vaultId: string): Promise<void> {
    if (keyVaultGameIds.length === 0) return;
    const count = await prisma.keyVaultGame.count({
        where: { id: { in: keyVaultGameIds }, keyVaultId: vaultId },
    });
    if (count !== keyVaultGameIds.length) {
        throw new Error("Some selected keys do not belong to this vault.");
    }
}

/**
 * Creates a new share for a vault (#9). The caller must unlock the vault with its
 * `secret` (for PIN/PASSWORD vaults) so the vault key can be re-wrapped under the
 * share passphrase.
 */
export const createVaultShare = actionClientWithAuth.inputSchema(z.object({
    vaultId: z.cuid(),
    mode: z.enum(VaultShareMode),
    maxKeys: z.number().int().positive().nullable().optional(),
    keyVaultGameIds: z.array(z.cuid()).default([]),
    passphrase: passphraseSchema,
    secret: z.string().optional(),
})).action<{ id: string }>(withLogging(async ({ parsedInput: { vaultId, mode, maxKeys, keyVaultGameIds, passphrase, secret }, ctx }, { log }) => {
    log.info("Creating vault share", { userId: ctx.user.id, vaultId, mode });

    assertSharingEnabled();

    const vault = await loadShareableVault(vaultId, ctx.user.id);
    await assertKeysBelongToVault(keyVaultGameIds, vaultId);

    const vaultKeyHex = unwrapVaultKeyFromVault({ ...vault, secret });
    const material = createSharePassphraseMaterial(passphrase, vaultKeyHex);

    const share = await prisma.vaultShare.create({
        data: {
            keyVaultId: vaultId,
            createdById: ctx.user.id,
            mode,
            maxKeys: maxKeys ?? null,
            ...material,
            games: keyVaultGameIds.length > 0
                ? { create: keyVaultGameIds.map((keyVaultGameId) => ({ keyVaultGameId })) }
                : undefined,
        },
        select: { id: true },
    });

    return { id: share.id };
}, {
    namespace: "server.actions.vault-shares:createVaultShare",
}));

/** Updates a share's enabled flag, mode, key limit, and/or game whitelist. */
export const updateVaultShare = actionClientWithAuth.inputSchema(z.object({
    shareId: z.cuid(),
    enabled: z.boolean().optional(),
    mode: z.enum(VaultShareMode).optional(),
    maxKeys: z.number().int().positive().nullable().optional(),
    keyVaultGameIds: z.array(z.cuid()).optional(),
})).action<{ success: true }>(withLogging(async ({ parsedInput: { shareId, enabled, mode, maxKeys, keyVaultGameIds }, ctx }, { log }) => {
    log.info("Updating vault share", { userId: ctx.user.id, shareId });

    const share = await loadManagedShare(shareId, ctx.user.id);

    if (keyVaultGameIds) {
        await assertKeysBelongToVault(keyVaultGameIds, share.keyVault.id);
    }

    await prisma.$transaction(async (tx) => {
        await tx.vaultShare.update({
            where: { id: shareId },
            data: {
                ...(enabled !== undefined ? { enabled } : {}),
                ...(mode !== undefined ? { mode } : {}),
                ...(maxKeys !== undefined ? { maxKeys } : {}),
            },
        });

        if (keyVaultGameIds) {
            await tx.vaultShareGame.deleteMany({ where: { shareId } });
            if (keyVaultGameIds.length > 0) {
                await tx.vaultShareGame.createMany({
                    data: keyVaultGameIds.map((keyVaultGameId) => ({ shareId, keyVaultGameId })),
                    skipDuplicates: true,
                });
            }
        }
    });

    return { success: true };
}, {
    namespace: "server.actions.vault-shares:updateVaultShare",
}));

/** Deletes a share and all of its links, recipients, and requests. */
export const deleteVaultShare = actionClientWithAuth.inputSchema(z.object({
    shareId: z.cuid(),
})).action<{ success: true }>(withLogging(async ({ parsedInput: { shareId }, ctx }, { log }) => {
    log.info("Deleting vault share", { userId: ctx.user.id, shareId });

    await loadManagedShare(shareId, ctx.user.id);
    await prisma.vaultShare.delete({ where: { id: shareId } });

    return { success: true };
}, {
    namespace: "server.actions.vault-shares:deleteVaultShare",
}));

/** Creates a one-time (by default) share link that a non-member can claim after signing in. */
export const createVaultShareLink = actionClientWithAuth.inputSchema(z.object({
    shareId: z.cuid(),
    maxUses: z.number().int().positive().nullable().optional(),
    expiresInDays: z.number().int().positive().max(365).nullable().optional(),
})).action<{ token: string }>(withLogging(async ({ parsedInput: { shareId, maxUses, expiresInDays }, ctx }, { log }) => {
    log.info("Creating vault share link", { userId: ctx.user.id, shareId });

    assertSharingEnabled();
    await loadManagedShare(shareId, ctx.user.id);

    const token = randomBytes(24).toString("base64url");
    const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    await prisma.vaultShareLink.create({
        data: { shareId, token, maxUses: maxUses ?? 1, expiresAt },
    });

    return { token };
}, {
    namespace: "server.actions.vault-shares:createVaultShareLink",
}));

/** Revokes a share link. */
export const revokeVaultShareLink = actionClientWithAuth.inputSchema(z.object({
    linkId: z.cuid(),
})).action<{ success: true }>(withLogging(async ({ parsedInput: { linkId }, ctx }, { log }) => {
    log.info("Revoking vault share link", { userId: ctx.user.id, linkId });

    const link = await prisma.vaultShareLink.findUnique({
        where: { id: linkId },
        select: { shareId: true },
    });
    if (!link) throw new Error("Link not found.");

    await loadManagedShare(link.shareId, ctx.user.id);
    await prisma.vaultShareLink.delete({ where: { id: linkId } });

    return { success: true };
}, {
    namespace: "server.actions.vault-shares:revokeVaultShareLink",
}));

/** Invites an existing gamepile user directly to a share. */
export const inviteUserToVaultShare = actionClientWithAuth.inputSchema(z.object({
    shareId: z.cuid(),
    userId: z.cuid(),
})).action<{ success: true }>(withLogging(async ({ parsedInput: { shareId, userId }, ctx }, { log }) => {
    log.info("Inviting user to vault share", { userId: ctx.user.id, shareId, invitedUserId: userId });

    assertSharingEnabled();
    await loadManagedShare(shareId, ctx.user.id);

    if (userId === ctx.user.id) {
        throw new Error("You cannot invite yourself.");
    }

    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, settings: { select: { privacyAllowVaultInvites: true, privacyAllowCollectionInvites: true } } },
    });
    if (!targetUser) throw new Error("User not found.");

    if (!allowsInviteForResource(targetUser.settings, "vault")) {
        throw new Error(getInvitePrivacyErrorMessage("vault"));
    }

    try {
        await prisma.vaultShareRecipient.create({ data: { shareId, userId } });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new Error("This user has already been invited to the share.");
        }
        throw error;
    }

    return { success: true };
}, {
    namespace: "server.actions.vault-shares:inviteUserToVaultShare",
}));

/** Removes a recipient from a share. */
export const removeVaultShareRecipient = actionClientWithAuth.inputSchema(z.object({
    recipientId: z.cuid(),
})).action<{ success: true }>(withLogging(async ({ parsedInput: { recipientId }, ctx }, { log }) => {
    log.info("Removing vault share recipient", { userId: ctx.user.id, recipientId });

    const recipient = await prisma.vaultShareRecipient.findUnique({
        where: { id: recipientId },
        select: { shareId: true },
    });
    if (!recipient) throw new Error("Recipient not found.");

    await loadManagedShare(recipient.shareId, ctx.user.id);
    await prisma.vaultShareRecipient.delete({ where: { id: recipientId } });

    return { success: true };
}, {
    namespace: "server.actions.vault-shares:removeVaultShareRecipient",
}));

/**
 * Claims a one-time share link for the authenticated user, making them a recipient
 * of the share. Designed to run right after a link recipient signs in / registers.
 */
export const claimVaultShareLink = actionClientWithAuth.inputSchema(z.object({
    token: z.string().min(1),
})).action<{ shareId: string }>(withLogging(async ({ parsedInput: { token }, ctx }, { log }) => {
    log.info("Claiming vault share link", { userId: ctx.user.id });

    assertSharingEnabled();

    const shareId = await prisma.$transaction(async (tx) => {
        const link = await tx.vaultShareLink.findUnique({
            where: { token },
            include: {
                _count: { select: { usages: true } },
                usages: { where: { usedById: ctx.user.id }, select: { id: true } },
                share: { select: { id: true, enabled: true } },
            },
        });

        if (!link) throw new Error("This share link is invalid.");
        if (!link.share.enabled) throw new Error("This share is no longer active.");
        if (link.expiresAt && link.expiresAt < new Date()) throw new Error("This share link has expired.");

        // Already claimed by this user — idempotent success.
        if (link.usages.length > 0) {
            await tx.vaultShareRecipient.upsert({
                where: { shareId_userId: { shareId: link.shareId, userId: ctx.user.id } },
                update: {},
                create: { shareId: link.shareId, userId: ctx.user.id },
            });
            return link.shareId;
        }

        if (link.maxUses != null && link._count.usages >= link.maxUses) {
            throw new Error("This share link has already been used.");
        }

        await tx.vaultShareLinkUsage.create({ data: { linkId: link.id, usedById: ctx.user.id } });
        await tx.vaultShareRecipient.upsert({
            where: { shareId_userId: { shareId: link.shareId, userId: ctx.user.id } },
            update: {},
            create: { shareId: link.shareId, userId: ctx.user.id },
        });

        return link.shareId;
    });

    return { shareId };
}, {
    namespace: "server.actions.vault-shares:claimVaultShareLink",
}));

/** Loads a share for a recipient action and returns the share plus the recipient's pool/limit. */
async function loadRecipientShare(shareId: string, userId: string) {
    const share = await prisma.vaultShare.findUnique({
        where: { id: shareId },
        include: {
            games: { select: { keyVaultGameId: true } },
            recipients: { where: { userId }, select: { id: true, maxKeys: true } },
        },
    });

    if (!share) throw new Error("Share not found.");
    if (!share.enabled) throw new Error("This share is no longer active.");
    if (share.recipients.length === 0) throw new Error("You do not have access to this share.");

    const poolIds = share.games.map((g) => g.keyVaultGameId);
    const effectiveMax = share.recipients[0].maxKeys ?? share.maxKeys ?? null;

    return { share, poolIds, effectiveMax };
}

/**
 * Directly claims (reveals + redeems) a single key from a DIRECT-mode share.
 * Enforces the passphrase, the game whitelist, the per-recipient key limit, and
 * single-use redemption atomically.
 */
export const claimSharedKey = actionClientWithAuth.inputSchema(z.object({
    shareId: z.cuid(),
    keyVaultGameId: z.cuid(),
    passphrase: passphraseSchema,
})).action<{ key: string }>(withLogging(async ({ parsedInput: { shareId, keyVaultGameId, passphrase }, ctx }, { log }) => {
    log.info("Claiming shared key", { userId: ctx.user.id, shareId, keyVaultGameId });

    assertSharingEnabled();

    const { share, poolIds, effectiveMax } = await loadRecipientShare(shareId, ctx.user.id);
    if (share.mode !== VaultShareMode.DIRECT) {
        throw new Error("This share requires requesting keys for approval.");
    }
    if (poolIds.length > 0 && !poolIds.includes(keyVaultGameId)) {
        throw new Error("This key is not part of the share.");
    }

    const lockKey = `vault-share-lockout:${ctx.user.id}:${shareId}`;
    await assertNotLockedOut(lockKey);

    let vaultKeyHex: string | null;
    try {
        vaultKeyHex = unwrapShareVaultKey(share, passphrase);
    } catch (error) {
        if (error instanceof Error && error.message === "Incorrect passphrase") {
            throw new Error(await registerFailedAttempt(lockKey));
        }
        throw error;
    }
    await clearLockout(lockKey);

    const key = await prisma.$transaction(async (tx) => {
        if (effectiveMax != null) {
            const poolWhere = poolIds.length > 0
                ? { id: { in: poolIds } }
                : { keyVaultId: share.keyVaultId };
            const claimed = await tx.keyVaultGame.count({ where: { ...poolWhere, redeemedById: ctx.user.id } });
            if (claimed >= effectiveMax) {
                throw new Error(`You have reached the limit of ${effectiveMax} key(s) for this share.`);
            }
        }

        const claimedKey = await tx.keyVaultGame.findFirst({
            where: { id: keyVaultGameId, keyVaultId: share.keyVaultId },
            select: { key: true },
        });
        if (!claimedKey) throw new Error("Key not found.");

        const updated = await tx.keyVaultGame.updateMany({
            where: { id: keyVaultGameId, keyVaultId: share.keyVaultId, redeemed: false },
            data: { redeemed: true, redeemedById: ctx.user.id, redeemedAt: new Date() },
        });
        if (updated.count === 0) throw new Error("This key has already been claimed.");

        return vaultKeyHex ? decryptGameKey(claimedKey.key, vaultKeyHex) : claimedKey.key;
    });

    return { key };
}, {
    namespace: "server.actions.vault-shares:claimSharedKey",
}));

/** Requests a key from a REQUEST-mode share, pending owner approval. */
export const requestSharedGame = actionClientWithAuth.inputSchema(z.object({
    shareId: z.cuid(),
    keyVaultGameId: z.cuid(),
})).action<{ success: true }>(withLogging(async ({ parsedInput: { shareId, keyVaultGameId }, ctx }, { log }) => {
    log.info("Requesting shared game", { userId: ctx.user.id, shareId, keyVaultGameId });

    assertSharingEnabled();

    const { share, poolIds } = await loadRecipientShare(shareId, ctx.user.id);
    if (share.mode !== VaultShareMode.REQUEST) {
        throw new Error("This share allows direct claims, not requests.");
    }
    if (poolIds.length > 0 && !poolIds.includes(keyVaultGameId)) {
        throw new Error("This key is not part of the share.");
    }

    const target = await prisma.keyVaultGame.findFirst({
        where: { id: keyVaultGameId, keyVaultId: share.keyVaultId },
        select: { redeemed: true },
    });
    if (!target) throw new Error("Key not found.");
    if (target.redeemed) throw new Error("This key is no longer available.");

    try {
        await prisma.vaultShareRequest.create({
            data: { shareId, keyVaultGameId, requestedById: ctx.user.id },
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new Error("You have already requested this key.");
        }
        throw error;
    }

    return { success: true };
}, {
    namespace: "server.actions.vault-shares:requestSharedGame",
}));

/**
 * Approves or denies a pending key request. Approving reserves the key for the
 * requester (marks it redeemed by them); they then reveal it with the passphrase.
 */
export const resolveShareRequest = actionClientWithAuth.inputSchema(z.object({
    requestId: z.cuid(),
    approve: z.boolean(),
})).action<{ success: true }>(withLogging(async ({ parsedInput: { requestId, approve }, ctx }, { log }) => {
    log.info("Resolving share request", { userId: ctx.user.id, requestId, approve });

    const request = await prisma.vaultShareRequest.findUnique({
        where: { id: requestId },
        include: { share: { select: { id: true, keyVaultId: true, maxKeys: true, games: { select: { keyVaultGameId: true } }, recipients: { select: { userId: true, maxKeys: true } } } } },
    });
    if (!request) throw new Error("Request not found.");
    if (request.status !== VaultShareRequestStatus.PENDING) throw new Error("This request has already been resolved.");

    await loadManagedShare(request.share.id, ctx.user.id);

    if (!approve) {
        await prisma.vaultShareRequest.update({
            where: { id: requestId },
            data: { status: VaultShareRequestStatus.DENIED, resolvedById: ctx.user.id, resolvedAt: new Date() },
        });
        return { success: true };
    }

    await prisma.$transaction(async (tx) => {
        const poolIds = request.share.games.map((g) => g.keyVaultGameId);
        const recipient = request.share.recipients.find((r) => r.userId === request.requestedById);
        const effectiveMax = recipient?.maxKeys ?? request.share.maxKeys ?? null;

        if (effectiveMax != null) {
            const poolWhere = poolIds.length > 0 ? { id: { in: poolIds } } : { keyVaultId: request.share.keyVaultId };
            const claimed = await tx.keyVaultGame.count({ where: { ...poolWhere, redeemedById: request.requestedById } });
            if (claimed >= effectiveMax) {
                throw new Error(`The requester has reached the limit of ${effectiveMax} key(s) for this share.`);
            }
        }

        const updated = await tx.keyVaultGame.updateMany({
            where: { id: request.keyVaultGameId, keyVaultId: request.share.keyVaultId, redeemed: false },
            data: { redeemed: true, redeemedById: request.requestedById, redeemedAt: new Date() },
        });
        if (updated.count === 0) throw new Error("This key is no longer available.");

        await tx.vaultShareRequest.update({
            where: { id: requestId },
            data: { status: VaultShareRequestStatus.APPROVED, resolvedById: ctx.user.id, resolvedAt: new Date() },
        });
    });

    return { success: true };
}, {
    namespace: "server.actions.vault-shares:resolveShareRequest",
}));

/** Reveals the key for an approved request to the requester (passphrase-gated). */
export const revealApprovedKey = actionClientWithAuth.inputSchema(z.object({
    requestId: z.cuid(),
    passphrase: passphraseSchema,
})).action<{ key: string }>(withLogging(async ({ parsedInput: { requestId, passphrase }, ctx }, { log }) => {
    log.info("Revealing approved key", { userId: ctx.user.id, requestId });

    assertSharingEnabled();

    const request = await prisma.vaultShareRequest.findUnique({
        where: { id: requestId },
        include: {
            share: { select: { authHash: true, authSalt: true, keySalt: true, encryptedVaultKey: true, enabled: true } },
            keyVaultGame: { select: { key: true } },
        },
    });

    if (!request) throw new Error("Request not found.");
    if (request.requestedById !== ctx.user.id) throw new Error("You do not have access to this request.");
    if (request.status !== VaultShareRequestStatus.APPROVED) throw new Error("This request has not been approved.");
    if (!request.share.enabled) throw new Error("This share is no longer active.");

    const lockKey = `vault-share-lockout:${ctx.user.id}:reveal:${requestId}`;
    await assertNotLockedOut(lockKey);

    let vaultKeyHex: string | null;
    try {
        vaultKeyHex = unwrapShareVaultKey(request.share, passphrase);
    } catch (error) {
        if (error instanceof Error && error.message === "Incorrect passphrase") {
            throw new Error(await registerFailedAttempt(lockKey));
        }
        throw error;
    }
    await clearLockout(lockKey);

    const key = vaultKeyHex ? decryptGameKey(request.keyVaultGame.key, vaultKeyHex) : request.keyVaultGame.key;
    return { key };
}, {
    namespace: "server.actions.vault-shares:revealApprovedKey",
}));
