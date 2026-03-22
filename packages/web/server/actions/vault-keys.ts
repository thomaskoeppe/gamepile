"use server";

import {z} from "zod";

import {decryptKey, encryptKey, verifyPassword} from "@/lib/auth/crypto";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import {KeyVaultAuthType} from "@/prisma/generated/enums";
import {actionClientWithAuth} from "@/server/actions";

/**
 * Decrypts and returns the plaintext key for a vault game entry.
 *
 * @param input.vaultGameId - CUID of the vault game entry.
 * @param input.secret - PIN or password for vaults requiring authentication.
 * @returns The decrypted game key string in `XXXXX-XXXXX-XXXXX` format.
 * @throws {Error} If the vault game is not found or the user does not have access.
 * @throws {Error} If a secret is required by the vault but not provided.
 * @throws {Error} If the vault authentication credentials are not properly configured.
 * @throws {Error} If the provided secret is incorrect.
 * @throws {Error} If the decrypted key does not match the expected format.
 */
export const getDecryptedKey = actionClientWithAuth.inputSchema(z.object({
    vaultGameId: z.cuid(),
    secret: z.string().min(8).or(z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric")).optional(),
})).action<string>(withLogging(async ({ parsedInput: { vaultGameId, secret }, ctx }, { log }) => {
    log.info("Fetching decrypted key", {
        userId: ctx.user.id,
        vaultGameId,
    });

    const vaultGame = await prisma.keyVaultGame.findUnique({
        where: {
            id: vaultGameId,
            OR: [
                {
                    keyVault: {
                        createdBy: {
                            id: ctx.user.id
                        }
                    }
                },
                {
                    keyVault: {
                        users: {
                            some: {
                                userId: ctx.user.id,
                                canRedeem: true,
                            }
                        }
                    }
                }
            ]
        },
        include: {
            keyVault: true,
        }
    });

    if (!vaultGame) throw new Error("Vault game not found or access denied");

    if (vaultGame.keyVault.authType === KeyVaultAuthType.NONE) return vaultGame.key;

    if (!secret) throw new Error("Secret is required for this vault");

    if (!vaultGame.keyVault.authHash || !vaultGame.keyVault.authSalt) throw new Error("Vault authentication is not properly configured");

    const verifiedSecret = verifyPassword(secret, vaultGame.keyVault.authSalt, vaultGame.keyVault.authHash);

    if (!verifiedSecret) throw new Error("Incorrect secret");

    const key = decryptKey(vaultGame.key, secret);

    if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(key)) throw new Error("Decrypted key is in an invalid format");

    return key;
}, {
    namespace: "server.actions.vault-keys:getDecryptedKey",
}));

/**
 * Marks a vault game key as redeemed by the authenticated user.
 *
 * @param input.vaultGameId - CUID of the vault game entry to mark as redeemed.
 * @returns `true` on success.
 * @throws {Error} If the vault game is not found or the user does not have access.
 * @throws {Error} If the key has already been redeemed.
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
            OR: [
                {
                    keyVault: {
                        createdBy: {
                            id: ctx.user.id
                        }
                    }
                },
                {
                    keyVault: {
                        users: {
                            some: {
                                userId: ctx.user.id,
                                canRedeem: true,
                            }
                        }
                    }
                }
            ]
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

/**
 * Marks a previously redeemed vault game key as unredeemed.
 *
 * @param input.vaultGameId - CUID of the vault game entry to mark as unredeemed.
 * @returns `true` on success.
 * @throws {Error} If the vault game is not found or the user does not have access.
 * @throws {Error} If the key is not currently redeemed.
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
            OR: [
                {
                    keyVault: {
                        createdBy: {
                            id: ctx.user.id
                        }
                    }
                },
                {
                    keyVault: {
                        users: {
                            some: {
                                userId: ctx.user.id,
                                canRedeem: true,
                            }
                        }
                    }
                }
            ]
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
 * Imports one or more game keys into a vault, encrypting them if the vault requires authentication.
 *
 * @param input.vaultId - CUID of the target vault.
 * @param input.keys - Array of `{ name, code }` objects representing the keys to import.
 * @param input.secret - PIN or password required for authenticated vaults.
 * @returns A record mapping each key code to its import result `{ success, reason? }`.
 * @throws {Error} If the vault is not found or the user does not have create permission.
 * @throws {Error} If the vault requires authentication but no secret is provided.
 * @throws {Error} If the provided credentials are invalid.
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
        select: { id: true, authType: true, authHash: true, authSalt: true },
    });

    if (!vault) throw new Error("Vault not found or access denied");

    if (vault.authType !== "NONE") {
        if (!secret) throw new Error("Authentication required");
        if (!vault.authHash || !vault.authSalt) throw new Error("Vault auth not configured");
        const isValid = verifyPassword(secret, vault.authSalt, vault.authHash);
        if (!isValid) throw new Error("Invalid credentials");
    }

    const results: Record<string, { success: boolean; reason?: string }> = {};

    for (const key of keys) {
        try {
            let storedKey = key.code;
            if (vault.authType !== "NONE" && secret) {
                storedKey = encryptKey(key.code, secret);
            }

            const game = await prisma.game.findFirst({
                where: { name: { contains: key.name, mode: "insensitive" } },
                select: { id: true },
            });

            await prisma.keyVaultGame.create({
                data: {
                    keyVaultId: vaultId,
                    key: storedKey,
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
