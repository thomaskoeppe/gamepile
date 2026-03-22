"use server";

import {z} from "zod";

import {getSetting} from "@/lib/app-settings";
import {generateSalt, hashPassword, verifyPassword} from "@/lib/auth/crypto";
import {generateVaultAccessToken, setVaultAccessCookie} from "@/lib/auth/vault/token";
import prisma from "@/lib/prisma";
import {redis} from "@/lib/redis";
import { withLogging } from "@/lib/with-logging";
import {AppSettingKey,KeyVaultAuthType} from "@/prisma/generated/enums";
import {actionClientWithAuth} from "@/server/actions";

/**
 * Creates a new key vault for the authenticated user.
 *
 * @param input.name - Vault name (5–25 characters).
 * @param input.authType - Authentication type: NONE, PIN, or PASSWORD.
 * @param input.pin - 4–6 digit numeric PIN (required when authType is PIN).
 * @param input.password - Password of at least 8 characters (required when authType is PASSWORD).
 * @returns The created vault's `id` and `name`.
 * @throws {Error} If PIN or password is missing when required by the chosen auth type.
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

    if (authType === "PIN" && pin) {
        authSalt = generateSalt();
        authHash = hashPassword(pin, authSalt);
    } else if (authType === "PASSWORD" && password) {
        authSalt = generateSalt();
        authHash = hashPassword(password, authSalt);
    }

    const vault = await prisma.keyVault.create({
        data: {
            name,
            authType,
            authHash,
            authSalt,
            createdBy: {
                connect: {id: ctx.user.id},
            }
        }
    });

    return { id: vault.id, name: vault.name };
}, {
    namespace: "server.actions.vaults:createVault",
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
 * @throws {Error} If the user is locked out due to too many failed attempts.
 * @throws {Error} If the vault is not found or the user does not have access.
 * @throws {Error} If the vault does not require authentication.
 * @throws {Error} If vault authentication credentials are not configured.
 * @throws {Error} If the provided secret is incorrect.
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
