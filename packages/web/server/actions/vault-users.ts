"use server";

import { z } from "zod";

import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { actionClientWithAuth } from "@/server/actions";
import { allowsInviteForResource, getInvitePrivacyErrorMessage } from "@/server/lib/invite-privacy";

/**
 * Adds a user to a vault's shared user list.
 *
 * @param input.vaultId - CUID of the vault.
 * @param input.userId - CUID of the user to add.
 * @returns `true` on success.
 */
export const addUserToVault = actionClientWithAuth.inputSchema(z.object({
    vaultId: z.cuid(),
    userId: z.cuid()
})).action<boolean>(withLogging(async ({ parsedInput: { vaultId, userId }, ctx }, { log }) => {
    log.info("Adding user to vault", {
        userId: ctx.user.id,
        vaultId,
        addedUserId: userId,
    });

    const vault = await prisma.keyVault.findUniqueOrThrow({
        where: { id: vaultId },
        select: { createdById: true },
    });

    if (vault.createdById !== ctx.user.id) {
        throw new Error("Only the vault owner can add members.");
    }

    if (userId === ctx.user.id) {
        throw new Error("The vault owner is already part of this vault.");
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

    if (!allowsInviteForResource(targetUser.settings, "vault")) {
        throw new Error(getInvitePrivacyErrorMessage("vault"));
    }

    const existingMember = await prisma.keyVaultUser.findUnique({
        where: {
            keyVaultId_userId: {
                keyVaultId: vaultId,
                userId,
            },
        },
        select: { id: true },
    });

    if (existingMember) {
        throw new Error("This user is already a vault member.");
    }

    await prisma.keyVaultUser.create({
        data: {
            keyVaultId: vaultId,
            userId: userId,
            addedById: ctx.user.id,
        }
    });

    return true;
}, {
    namespace: "server.actions.vault-users:addUserToVault",
}));

/**
 * Removes a user from a vault's shared user list.
 *
 * @param input.keyVaultUserId - CUID of the `KeyVaultUser` membership record to delete.
 * @returns `true` on success.
 */
export const removeUserFromVault = actionClientWithAuth.inputSchema(z.object({ keyVaultUserId: z.cuid() })).action<boolean>(withLogging(async ({ parsedInput: { keyVaultUserId }, ctx }, { log }) => {
    log.info("Removing user from vault", {
        userId: ctx.user.id,
        keyVaultUserId,
    });

    const keyVaultUser = await prisma.keyVaultUser.findUniqueOrThrow({
        where: { id: keyVaultUserId },
        include: {
            keyVault: {
                select: { createdById: true },
            },
        },
    });

    if (keyVaultUser.keyVault.createdById !== ctx.user.id) {
        throw new Error("Only the vault owner can remove members.");
    }

    await prisma.keyVaultUser.delete({
        where: {
            id: keyVaultUserId,
        }
    });

    return true;
}, {
    namespace: "server.actions.vault-users:removeUserFromVault",
}));