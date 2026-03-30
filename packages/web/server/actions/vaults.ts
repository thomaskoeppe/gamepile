"use server";

import {z} from "zod";

import {getSetting} from "@/lib/app-settings";
import {
    generateRecoveryKey,
    generateSalt,
    generateVaultKey,
    hashKey,
    hashPassword,
    unwrapVaultKey,
    unwrapVaultKeyWithRecovery,
    verifyPassword,
    wrapVaultKey,
    wrapVaultKeyWithRecovery,
} from "@/lib/auth/crypto";
import {generateVaultAccessToken, setVaultAccessCookie} from "@/lib/auth/vault/token";
import prisma from "@/lib/prisma";
import {redis} from "@/lib/redis";
import { withLogging } from "@/lib/with-logging";
import {AppSettingKey,KeyVaultAuthType} from "@/prisma/generated/enums";
import {actionClientWithAuth} from "@/server/actions";

/**
 * Creates a new key vault for the authenticated user.
 *
 * For PIN/PASSWORD vaults a random vault key is generated and wrapped (encrypted)
 * with both the user's secret and a recovery key. The recovery key is returned
 * once and must be saved by the user.
 *
 * @param input.name - Vault name (5–25 characters).
 * @param input.authType - Authentication type: NONE, PIN, or PASSWORD.
 * @param input.pin - 4–6 digit numeric PIN (required when authType is PIN).
 * @param input.password - Password of at least 8 characters (required when authType is PASSWORD).
 * @returns The created vault's `id`, `name`, and (for authenticated vaults) the one-time `recoveryKey`.
 */
export const createVault = actionClientWithAuth.inputSchema(z.object({
    name: z.string().min(5).max(25),
    authType: z.enum(KeyVaultAuthType),
    pin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric").optional(),
    password: z.string().min(8).optional(),
}).superRefine((data, ctx) => {
    if (data.authType === KeyVaultAuthType.PIN && !data.pin) {
        ctx.addIssue({ path: ["pin"], message: "PIN is required.", code: "custom" });
    }
    if (data.authType === KeyVaultAuthType.PASSWORD && !data.password) {
        ctx.addIssue({ path: ["password"], message: "Password is required.", code: "custom" });
    }
})).action(withLogging(async ({parsedInput: {name, authType, pin, password}, ctx}, {log}) => {
    log.info("Creating vault", {
        name, authType, userId: ctx.user.id
    });

    let authHash: string | null = null;
    let authSalt: string | null = null;
    let keySalt: string | null = null;
    let encryptedVaultKey: string | null = null;
    let recoveryEncryptedVaultKey: string | null = null;
    let recoveryKeyHash: string | null = null;
    let recoveryKey: string | null = null;

    if (authType !== KeyVaultAuthType.NONE) {
        const secret = authType === KeyVaultAuthType.PIN ? pin! : password!;

        // Password verification material
        authSalt = generateSalt();
        authHash = hashPassword(secret, authSalt);

        // Vault key (the actual AES key used for game keys)
        const vaultKey = generateVaultKey();

        // Wrap vault key with user's secret (separate salt from auth)
        keySalt = generateSalt();
        encryptedVaultKey = wrapVaultKey(vaultKey, secret, keySalt);

        // Wrap vault key with recovery key
        recoveryKey = generateRecoveryKey();
        recoveryEncryptedVaultKey = wrapVaultKeyWithRecovery(vaultKey, recoveryKey);
        recoveryKeyHash = hashKey(recoveryKey);
    }

    const vault = await prisma.keyVault.create({
        data: {
            name,
            authType,
            authHash,
            authSalt,
            keySalt,
            encryptedVaultKey,
            recoveryEncryptedVaultKey,
            recoveryKeyHash,
            createdBy: {
                connect: {id: ctx.user.id},
            }
        }
    });

    return { id: vault.id, name: vault.name, recoveryKey };
}, {
    namespace: "server.actions.vaults:createVault",
}));

/**
 * Changes the authentication credentials (PIN/password) for a vault.
 *
 * The vault key itself is NOT regenerated — only the password-based wrapping is
 * re-done with the new credentials. Existing game keys remain untouched.
 *
 * @param input.vaultId - ID of the vault.
 * @param input.newAuthType - New authentication type (PIN or PASSWORD).
 * @param input.currentSecret - Current PIN/password (mutually exclusive with recoveryKey).
 * @param input.recoveryKey - Recovery key (mutually exclusive with currentSecret).
 * @returns `{ success: true }` with an optional new `recoveryKey` if the recovery key was used.
 */
export const changeVaultCredentials = actionClientWithAuth.inputSchema(z.object({
    vaultId: z.string().min(1),
    newAuthType: z.enum([KeyVaultAuthType.PIN, KeyVaultAuthType.PASSWORD]),
    newPin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric").optional(),
    newPassword: z.string().min(8).optional(),
    currentSecret: z.string().min(1).optional(),
    recoveryKey: z.string().min(64).optional(),
}).superRefine((data, ctx) => {
    if (data.newAuthType === KeyVaultAuthType.PIN && !data.newPin) {
        ctx.addIssue({ path: ["newPin"], message: "PIN is required.", code: "custom" });
    }

    if (data.newAuthType === KeyVaultAuthType.PASSWORD && !data.newPassword) {
        ctx.addIssue({ path: ["newPassword"], message: "Password is required.", code: "custom" });
    }

    if (!data.currentSecret && !data.recoveryKey) {
        ctx.addIssue({ path: ["currentSecret"], message: "Current vault secret or recovery key is required.", code: "custom" });
    }
})).action(withLogging(async ({ parsedInput, ctx }, { log }) => {
    const {
        vaultId,
        newAuthType,
        newPin,
        newPassword,
        currentSecret,
        recoveryKey,
    } = parsedInput;

    log.info("Changing vault credentials", {
        userId: ctx.user.id,
        vaultId,
        newAuthType,
        usedRecoveryKey: Boolean(recoveryKey),
    });

    const allowPasswordChange = getSetting(AppSettingKey.VAULT_ALLOW_PASSWORD_CHANGE);
    if (!allowPasswordChange) {
        throw new Error("Vault password changes are disabled by the administrator.");
    }

    const vault = await prisma.keyVault.findFirst({
        where: {
            id: vaultId,
            createdById: ctx.user.id,
        },
        select: {
            id: true,
            authType: true,
            authHash: true,
            authSalt: true,
            keySalt: true,
            encryptedVaultKey: true,
            recoveryEncryptedVaultKey: true,
            recoveryKeyHash: true,
        },
    });

    if (!vault) {
        throw new Error("Vault not found or you do not have permission to update it.");
    }

    if (vault.authType === KeyVaultAuthType.NONE) {
        throw new Error("Cannot rotate credentials for a vault without authentication.");
    }

    // Unwrap the vault key using the provided credential
    let vaultKeyHex: string;
    let newRecoveryKey: string | null = null;

    if (recoveryKey) {
        if (!vault.recoveryKeyHash) {
            throw new Error("Recovery key is not configured for this vault.");
        }

        const normalizedRecoveryKey = recoveryKey.trim().toLowerCase();
        const matchesRecoveryKey = hashKey(normalizedRecoveryKey) === vault.recoveryKeyHash;

        if (!matchesRecoveryKey) {
            throw new Error("Invalid recovery key.");
        }

        if (!vault.recoveryEncryptedVaultKey) {
            throw new Error("Recovery-encrypted vault key is missing.");
        }

        vaultKeyHex = unwrapVaultKeyWithRecovery(vault.recoveryEncryptedVaultKey, normalizedRecoveryKey);

        // When recovering via recovery key, generate a fresh recovery key for safety
        newRecoveryKey = generateRecoveryKey();
    } else {
        if (!currentSecret) {
            throw new Error("Current vault secret is required.");
        }
        if (!vault.authHash || !vault.authSalt) {
            throw new Error("Vault authentication is not configured.");
        }

        const validCurrentSecret = verifyPassword(currentSecret, vault.authSalt, vault.authHash);
        if (!validCurrentSecret) {
            throw new Error("Current vault secret is incorrect.");
        }

        if (!vault.encryptedVaultKey || !vault.keySalt) {
            throw new Error("Vault key material is missing.");
        }

        vaultKeyHex = unwrapVaultKey(vault.encryptedVaultKey, currentSecret, vault.keySalt);
    }

    // Re-wrap vault key with new credentials
    const newSecret = newAuthType === KeyVaultAuthType.PIN ? newPin! : newPassword!;
    const newAuthSalt = generateSalt();
    const newAuthHash = hashPassword(newSecret, newAuthSalt);
    const newKeySalt = generateSalt();
    const newEncryptedVaultKey = wrapVaultKey(vaultKeyHex, newSecret, newKeySalt);

    // If recovery key was used, also re-wrap with new recovery key
    const updateData: Record<string, unknown> = {
        authType: newAuthType,
        authHash: newAuthHash,
        authSalt: newAuthSalt,
        keySalt: newKeySalt,
        encryptedVaultKey: newEncryptedVaultKey,
    };

    if (newRecoveryKey) {
        updateData.recoveryEncryptedVaultKey = wrapVaultKeyWithRecovery(vaultKeyHex, newRecoveryKey);
        updateData.recoveryKeyHash = hashKey(newRecoveryKey);
    }

    await prisma.keyVault.update({
        where: { id: vault.id },
        data: updateData,
    });

    return {
        success: true,
        recoveryKey: newRecoveryKey,
    };
}, {
    namespace: "server.actions.vaults:changeVaultCredentials",
}));

/**
 * Renames an existing vault owned by the authenticated user.
 *
 * @param input.vaultId - ID of the vault to rename.
 * @param input.name - New vault name (5–25 characters).
 * @returns `{ success: true }` on success.
 * @throws {Error} If the vault is not found or the user does not own it.
 */
export const renameVault = actionClientWithAuth.inputSchema(z.object({
    vaultId: z.string().min(1),
    name: z.string().min(5).max(25),
})).action(withLogging(async ({ parsedInput: { vaultId, name }, ctx }, { log }) => {
    log.info("Renaming vault", { userId: ctx.user.id, vaultId, name });

    const vault = await prisma.keyVault.findFirst({
        where: { id: vaultId, createdById: ctx.user.id },
        select: { id: true },
    });

    if (!vault) throw new Error("Vault not found or you do not have permission to rename it.");

    await prisma.keyVault.update({
        where: { id: vaultId },
        data: { name },
    });

    return { success: true };
}, {
    namespace: "server.actions.vaults:renameVault",
}));

/**
 * Deletes a vault owned by the authenticated user.
 *
 * @param input.vaultId - ID of the vault to delete.
 * @returns `{ success: true }` on success.
 * @throws {Error} If vault deletion is disabled by the administrator.
 * @throws {Error} If the vault is not found or the user does not own it.
 */
export const deleteVault = actionClientWithAuth.inputSchema(z.object({
    vaultId: z.string().min(1),
})).action(withLogging(async ({ parsedInput: { vaultId }, ctx }, { log }) => {
    log.info("Deleting vault", { userId: ctx.user.id, vaultId });

    const allowDeletion = getSetting(AppSettingKey.ALLOW_VAULT_DELETION);
    if (!allowDeletion) throw new Error("Vault deletion is disabled by the administrator.");

    const vault = await prisma.keyVault.findFirst({
        where: { id: vaultId, createdById: ctx.user.id },
        select: { id: true },
    });

    if (!vault) throw new Error("Vault not found or you do not have permission to delete it.");

    await prisma.keyVault.delete({ where: { id: vaultId } });

    return { success: true };
}, {
    namespace: "server.actions.vaults:deleteVault",
}));

/**
 * Authenticates the user against a vault's PIN or password and sets a vault access cookie.
 *
 * @param input.vaultId - ID of the vault to authenticate against.
 * @param input.secret - The PIN or password to verify.
 * @returns `{ success: true }` on successful authentication.
 */
export const authenticateVault = actionClientWithAuth.inputSchema(z.object({
    vaultId: z.string().min(1),
    secret: z.string().min(1),
})).action(withLogging(async ({ parsedInput: { vaultId, secret }, ctx }, { log }) => {
    log.info("Authenticating vault", { userId: ctx.user.id, vaultId });

    const lockoutEnabled = getSetting(AppSettingKey.VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD);
    const maxAttempts = getSetting(AppSettingKey.VAULT_BLOCK_AFTER_ATTEMPTS);
    const blockDuration = getSetting(AppSettingKey.VAULT_BLOCK_DURATION_SECONDS);

    if (lockoutEnabled) {
        const attempts = await redis.get(`vault-lockout:${ctx.user.id}:${vaultId}`);

        if (attempts !== null && Number(attempts) >= maxAttempts) {
            const ttl = await redis.ttl(`vault-lockout:${ctx.user.id}:${vaultId}`);
            const remaining = ttl > 0 ? ttl : blockDuration;
            log.warn("Vault auth locked out", {
                userId: ctx.user.id,
                vaultId,
                attempts: Number(attempts),
                maxAttempts,
                remainingSeconds: remaining,
            });
            throw new Error(
                `Too many failed attempts. Try again in ${Math.ceil(remaining / 60)} minute(s).`,
            );
        }
    }

    const vault = await prisma.keyVault.findFirst({
        where: {
            id: vaultId,
            OR: [
                { createdById: ctx.user.id },
                { users: { some: { userId: ctx.user.id } } },
            ],
        },
        select: {
            id: true,
            authType: true,
            authHash: true,
            authSalt: true,
        },
    });

    if (!vault) throw new Error("Vault not found");

    if (vault.authType === "NONE") throw new Error("Vault does not require authentication");

    if (!vault.authHash || !vault.authSalt) throw new Error("Vault authentication is not configured");

    const isValid = verifyPassword(secret, vault.authSalt, vault.authHash);

    if (!isValid) {
        log.warn("Vault authentication failed — incorrect secret", { userId: ctx.user.id, vaultId, authType: vault.authType });
        if (lockoutEnabled) {
            const newCount = await redis.incr(`vault-lockout:${ctx.user.id}:${vaultId}`);

            if (newCount === 1) {
                await redis.expire(`vault-lockout:${ctx.user.id}:${vaultId}`, blockDuration);
            }

            const remaining = maxAttempts - newCount;

            if (remaining > 0) {
                throw new Error(
                    `Invalid password or PIN. ${remaining} attempt(s) remaining.`,
                );
            }

            await redis.expire(`vault-lockout:${ctx.user.id}:${vaultId}`, blockDuration);
            throw new Error(
                `Too many failed attempts. Try again in ${Math.ceil(blockDuration / 60)} minute(s).`,
            );
        }

        throw new Error("Invalid password or PIN");
    }

    if (lockoutEnabled) {
        await redis.del(`vault-lockout:${ctx.user.id}:${vaultId}`);
    }

    const token = generateVaultAccessToken(vault.id, ctx.user.id);
    await setVaultAccessCookie(vault.id, token);

    log.info("Vault authentication succeeded", { userId: ctx.user.id, vaultId, authType: vault.authType });

    return { success: true };
}, {
    namespace: "server.actions.vaults:authenticateVault",
}));
