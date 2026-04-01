"use server";

import {z} from "zod";

import {
    decryptGameKey,
    encryptGameKey,
    hashKey,
    unwrapVaultKey,
    verifyPassword,
} from "@/lib/auth/crypto";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import {KeyVaultAuthType} from "@/prisma/generated/enums";
import {actionClientWithAuth} from "@/server/actions";

const keyPattern = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

const vaultSecretSchema = z
    .string()
    .min(8)
    .or(z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric"));

function getVaultKeyAccessWhere(userId: string) {
    return {
        OR: [
            {
                keyVault: {
                    createdBy: {
                        id: userId,
                    },
                },
            },
            {
                keyVault: {
                    users: {
                        some: {
                            userId,
                            canRedeem: true,
                        },
                    },
                },
            },
        ],
    };
}

/**
 * Verifies the user's secret against the vault and unwraps the vault key.
 * Centralised helper used by all key operations.
 */
function unwrapVaultKeyFromVault(params: {
    authType: KeyVaultAuthType;
    authHash: string | null;
    authSalt: string | null;
    keySalt: string | null;
    encryptedVaultKey: string | null;
    secret?: string;
}): string | null {
    const { authType, authHash, authSalt, keySalt, encryptedVaultKey, secret } = params;

    if (authType === KeyVaultAuthType.NONE) {
        return null; // NONE vaults store keys in plaintext
    }

    if (!secret) {
        throw new Error("Secret is required for this vault");
    }
    if (!authHash || !authSalt) {
        throw new Error("Vault authentication is not properly configured");
    }
    if (!encryptedVaultKey || !keySalt) {
        throw new Error("Vault key material is missing");
    }

    const verified = verifyPassword(secret, authSalt, authHash);
    if (!verified) {
        throw new Error("Incorrect secret");
    }

    return unwrapVaultKey(encryptedVaultKey, secret, keySalt);
}

/**
 * Decrypts and returns the plaintext key for a vault game entry.
 *
 * @param input.vaultGameId - CUID of the vault game entry.
 * @param input.secret - PIN or password for vaults requiring authentication.
 * @returns The decrypted game key string in `XXXXX-XXXXX-XXXXX` format.
 */
export const getDecryptedKey = actionClientWithAuth.inputSchema(z.object({
    vaultGameId: z.cuid(),
    secret: vaultSecretSchema.optional(),
})).action<string>(withLogging(async ({ parsedInput: { vaultGameId, secret }, ctx }, { log }) => {
    log.info("Fetching decrypted key", {
        userId: ctx.user.id,
        vaultGameId,
    });

    const vaultGame = await prisma.keyVaultGame.findUnique({
        where: {
            id: vaultGameId,
            ...getVaultKeyAccessWhere(ctx.user.id),
        },
        include: {
            keyVault: {
                select: {
                    authType: true,
                    authHash: true,
                    authSalt: true,
                    keySalt: true,
                    encryptedVaultKey: true,
                },
            },
        },
    });

    if (!vaultGame) throw new Error("Vault game not found or access denied");

    const vaultKeyHex = unwrapVaultKeyFromVault({
        ...vaultGame.keyVault,
        secret,
    });

    const key = vaultKeyHex
        ? decryptGameKey(vaultGame.key, vaultKeyHex)
        : vaultGame.key;

    if (!keyPattern.test(key)) throw new Error("Decrypted key is in an invalid format");

    return key;
}, {
    namespace: "server.actions.vault-keys:getDecryptedKey",
}));

export const getDecryptedKeys = actionClientWithAuth.inputSchema(z.object({
    vaultGameIds: z.array(z.cuid()).min(1).max(200),
    secret: vaultSecretSchema.optional(),
})).action<Array<{ vaultGameId: string; gameName: string; key?: string; error?: string; redeemed: boolean }>>(withLogging(async ({ parsedInput: { vaultGameIds, secret }, ctx }, { log }) => {
    log.info("Fetching decrypted keys in bulk", {
        userId: ctx.user.id,
        count: vaultGameIds.length,
    });

    const vaultGames = await prisma.keyVaultGame.findMany({
        where: {
            id: { in: vaultGameIds },
            ...getVaultKeyAccessWhere(ctx.user.id),
        },
        include: {
            game: {
                select: {
                    name: true,
                },
            },
            keyVault: {
                select: {
                    id: true,
                    authType: true,
                    authHash: true,
                    authSalt: true,
                    keySalt: true,
                    encryptedVaultKey: true,
                },
            },
        },
    });

    const vaultKeyCache = new Map<string, string | null>();

    const inputIdSet = new Set(vaultGameIds);
    const foundIdSet = new Set(vaultGames.map((game) => game.id));

    const results = vaultGames.map((vaultGame) => {
        const gameName = vaultGame.game?.name ?? vaultGame.originalName ?? "Unknown Game";

        try {
            let vaultKeyHex: string | null;

            if (vaultKeyCache.has(vaultGame.keyVault.id)) {
                vaultKeyHex = vaultKeyCache.get(vaultGame.keyVault.id)!;
            } else {
                vaultKeyHex = unwrapVaultKeyFromVault({
                    ...vaultGame.keyVault,
                    secret,
                });
                vaultKeyCache.set(vaultGame.keyVault.id, vaultKeyHex);
            }

            const key = vaultKeyHex
                ? decryptGameKey(vaultGame.key, vaultKeyHex)
                : vaultGame.key;

            if (!keyPattern.test(key)) {
                throw new Error("Decrypted key is in an invalid format");
            }

            return {
                vaultGameId: vaultGame.id,
                gameName,
                key,
                redeemed: vaultGame.redeemed,
            };
        } catch (error) {
            return {
                vaultGameId: vaultGame.id,
                gameName,
                redeemed: vaultGame.redeemed,
                error: error instanceof Error ? error.message : "Failed to decrypt key",
            };
        }
    });

    for (const vaultGameId of inputIdSet) {
        if (!foundIdSet.has(vaultGameId)) {
            results.push({
                vaultGameId,
                gameName: "Unknown Game",
                redeemed: false,
                error: "Vault game not found or access denied",
            });
        }
    }

    return results;
}, {
    namespace: "server.actions.vault-keys:getDecryptedKeys",
}));

/**
 * Marks a vault game key as redeemed by the authenticated user.
 *
 * @param input.vaultGameId - CUID of the vault game entry to mark as redeemed.
 * @returns `true` on success.
 */
export const redeemKey = actionClientWithAuth.inputSchema(z.object({
    vaultGameId: z.cuid(),
})).action<boolean>(withLogging(async ({ parsedInput: { vaultGameId }, ctx }, { log }) => {
    log.info("Redeeming key", {
        userId: ctx.user.id,
        vaultGameId,
    });

    const vaultGame = await prisma.keyVaultGame.findUnique({
        where: {
            id: vaultGameId,
            ...getVaultKeyAccessWhere(ctx.user.id),
        }
    });

    if (!vaultGame) throw new Error("Vault game not found or access denied");

    if (vaultGame.redeemed) throw new Error("Key has already been redeemed");

    await prisma.keyVaultGame.update({
        where: {id: vaultGameId},
        data: {
            redeemedAt: new Date(),
            redeemed: true,
            redeemedById: ctx.user.id,
        },
    });

    return true;
}, {
    namespace: "server.actions.vault-keys:redeemKey",
}));

export const redeemKeys = actionClientWithAuth.inputSchema(z.object({
    vaultGameIds: z.array(z.cuid()).min(1).max(200),
})).action<{ updatedCount: number }>(withLogging(async ({ parsedInput: { vaultGameIds }, ctx }, { log }) => {
    log.info("Redeeming keys in bulk", {
        userId: ctx.user.id,
        count: vaultGameIds.length,
    });

    const result = await prisma.keyVaultGame.updateMany({
        where: {
            id: {
                in: vaultGameIds,
            },
            redeemed: false,
            ...getVaultKeyAccessWhere(ctx.user.id),
        },
        data: {
            redeemedAt: new Date(),
            redeemed: true,
            redeemedById: ctx.user.id,
        },
    });

    return {
        updatedCount: result.count,
    };
}, {
    namespace: "server.actions.vault-keys:redeemKeys",
}));

/**
 * Marks a previously redeemed vault game key as unredeemed.
 *
 * @param input.vaultGameId - CUID of the vault game entry to mark as unredeemed.
 * @returns `true` on success.
 */
export const unredeemKey = actionClientWithAuth.inputSchema(z.object({
    vaultGameId: z.cuid(),
})).action<boolean>(withLogging(async ({ parsedInput: { vaultGameId }, ctx }, { log }) => {
    log.info("Unredeeming key", {
        userId: ctx.user.id,
        vaultGameId,
    });

    const vaultGame = await prisma.keyVaultGame.findUnique({
        where: {
            id: vaultGameId,
            ...getVaultKeyAccessWhere(ctx.user.id),
        }
    });

    if (!vaultGame) throw new Error("Vault game not found or access denied");

    if (!vaultGame.redeemed) throw new Error("Key is not redeemed");

    await prisma.keyVaultGame.update({
        where: {id: vaultGameId},
        data: {
            redeemedAt: null,
            redeemed: false,
            redeemedById: null
        },
    });

    return true;
}, {
    namespace: "server.actions.vault-keys:unredeemKey",
}));

/**
 * Imports one or more game keys into a vault, encrypting them with the vault key.
 *
 * @param input.vaultId - CUID of the target vault.
 * @param input.keys - Array of `{ name, code }` objects representing the keys to import.
 * @param input.secret - PIN or password required for authenticated vaults.
 * @returns A record mapping each key code to its import result `{ success, reason? }`.
 */
export const importKeys = actionClientWithAuth.inputSchema(z.object({
    vaultId: z.cuid(),
    keys: z.array(z.object({
        name: z.string(),
        code: z.string(),
    })),
    secret: z.string().optional(),
})).action<Record<string, { success: boolean; reason?: string }>>(withLogging(async ({ parsedInput: { vaultId, keys, secret }, ctx }, { log }) => {
    log.info("Importing keys to vault", {
        userId: ctx.user.id,
        vaultId,
        keyCount: keys.length,
    });

    const vault = await prisma.keyVault.findFirst({
        where: {
            id: vaultId,
            OR: [
                { createdById: ctx.user.id },
                { users: { some: { userId: ctx.user.id, canCreate: true } } },
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

    if (!vault) throw new Error("Vault not found or access denied");

    const vaultKeyHex = unwrapVaultKeyFromVault({
        ...vault,
        secret,
    });

    const results: Record<string, { success: boolean; reason?: string }> = {};

    for (const key of keys) {
        try {
            const normalizedCode = key.code.trim().toUpperCase();
            if (!keyPattern.test(normalizedCode)) {
                throw new Error("Invalid key format");
            }

            const hashedKey = hashKey(normalizedCode);

            const storedKey = vaultKeyHex
                ? encryptGameKey(normalizedCode, vaultKeyHex)
                : normalizedCode;

            const game = await prisma.game.findFirst({
                where: { name: { contains: key.name, mode: "insensitive" } },
                select: { id: true },
            });

            await prisma.keyVaultGame.create({
                data: {
                    keyVaultId: vaultId,
                    key: storedKey,
                    hashedKey,
                    originalName: key.name,
                    gameId: game?.id ?? null,
                    addedById: ctx.user.id,
                },
            });

            results[key.code] = { success: true };
        } catch (e) {
            log.warn("Key import failed for individual key", {
                vaultId,
                keyName: key.name,
                errorMessage: e instanceof Error ? e.message : "Unknown error",
            });
            results[key.code] = {
                success: false,
                reason: e instanceof Error ? e.message : "Unknown error",
            };
        }
    }

    return results;
}, {
    namespace: "server.actions.vault-keys:importKeys",
}));
