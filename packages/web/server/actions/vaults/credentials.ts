"use server";

import { timingSafeEqual } from "crypto";
import { z } from "zod";

import { getSetting } from "@/lib/app-settings";
import {
    generateRecoveryKey,
    generateSalt,
    hashKey,
    hashPassword,
    unwrapVaultKey,
    unwrapVaultKeyWithRecovery,
    verifyPassword,
    wrapVaultKey,
    wrapVaultKeyWithRecovery,
} from "@/lib/auth/crypto";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { AppSettingKey, KeyVaultAuthType } from "@/prisma/generated/enums";
import { actionClientWithAuth } from "@/server/actions";

export const changeVaultCredentials = actionClientWithAuth
    .inputSchema(
        z
            .object({
                vaultId: z.string().min(1),
                newAuthType: z.enum([KeyVaultAuthType.PIN, KeyVaultAuthType.PASSWORD]),
                newPin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric").optional(),
                newPassword: z.string().min(8).optional(),
                currentSecret: z.string().min(1).optional(),
                recoveryKey: z.string().min(64).optional(),
            })
            .superRefine((data, ctx) => {
                if (data.newAuthType === KeyVaultAuthType.PIN && !data.newPin) {
                    ctx.addIssue({ path: ["newPin"], message: "PIN is required.", code: "custom" });
                }

                if (data.newAuthType === KeyVaultAuthType.PASSWORD && !data.newPassword) {
                    ctx.addIssue({ path: ["newPassword"], message: "Password is required.", code: "custom" });
                }

                if (!data.currentSecret && !data.recoveryKey) {
                    ctx.addIssue({
                        path: ["currentSecret"],
                        message: "Current vault secret or recovery key is required.",
                        code: "custom",
                    });
                }
            }),
    )
    .action(
        withLogging(
            async ({ parsedInput, ctx }, { log }) => {
                const { vaultId, newAuthType, newPin, newPassword, currentSecret, recoveryKey } = parsedInput;

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

                let vaultKeyHex: string;
                let newRecoveryKey: string | null = null;

                if (recoveryKey) {
                    if (!vault.recoveryKeyHash) {
                        throw new Error("Recovery key is not configured for this vault.");
                    }

                    const normalizedRecoveryKey = recoveryKey.trim().toLowerCase();
                    const computedHash = hashKey(normalizedRecoveryKey);
                    const expectedHash = vault.recoveryKeyHash;
                    const matchesRecoveryKey =
                        computedHash.length === expectedHash.length &&
                        timingSafeEqual(Buffer.from(computedHash, "utf8"), Buffer.from(expectedHash, "utf8"));

                    if (!matchesRecoveryKey) {
                        throw new Error("Invalid recovery key.");
                    }

                    if (!vault.recoveryEncryptedVaultKey) {
                        throw new Error("Recovery-encrypted vault key is missing.");
                    }

                    vaultKeyHex = unwrapVaultKeyWithRecovery(vault.recoveryEncryptedVaultKey, normalizedRecoveryKey);
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

                const newSecret = newAuthType === KeyVaultAuthType.PIN ? newPin! : newPassword!;
                const newAuthSalt = generateSalt();
                const newAuthHash = hashPassword(newSecret, newAuthSalt);
                const newKeySalt = generateSalt();
                const newEncryptedVaultKey = wrapVaultKey(vaultKeyHex, newSecret, newKeySalt);

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
            },
            {
                namespace: "server.actions.vaults:changeVaultCredentials",
            },
        ),
    );

