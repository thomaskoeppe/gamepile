"use server";

import { z } from "zod";

import { getSetting } from "@/lib/app-settings";
import {
    generateRecoveryKey,
    generateSalt,
    generateVaultKey,
    hashKey,
    hashPassword,
    wrapVaultKey,
    wrapVaultKeyWithRecovery,
} from "@/lib/auth/crypto";
import prisma from "@/lib/prisma";
import { withLogging } from "@/lib/with-logging";
import { AppSettingKey, KeyVaultAuthType } from "@/prisma/generated/enums";
import { actionClientWithAuth } from "@/server/actions";

export const createVault = actionClientWithAuth
    .inputSchema(
        z
            .object({
                name: z.string().min(5).max(25),
                authType: z.enum(KeyVaultAuthType),
                pin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric").optional(),
                password: z.string().min(8).optional(),
            })
            .superRefine((data, ctx) => {
                if (data.authType === KeyVaultAuthType.PIN && !data.pin) {
                    ctx.addIssue({ path: ["pin"], message: "PIN is required.", code: "custom" });
                }
                if (data.authType === KeyVaultAuthType.PASSWORD && !data.password) {
                    ctx.addIssue({ path: ["password"], message: "Password is required.", code: "custom" });
                }
            }),
    )
    .action(
        withLogging(
            async ({ parsedInput: { name, authType, pin, password }, ctx }, { log }) => {
                log.info("Creating vault", {
                    name,
                    authType,
                    userId: ctx.user.id,
                });

                const maxVaultsPerUser = getSetting(AppSettingKey.MAX_VAULTS_PER_USER);
                const existingVaults = await prisma.keyVault.count({
                    where: { createdById: ctx.user.id },
                });

                if (existingVaults >= maxVaultsPerUser) {
                    throw new Error(`Vault limit reached (${maxVaultsPerUser}).`);
                }

                let authHash: string | null = null;
                let authSalt: string | null = null;
                let keySalt: string | null = null;
                let encryptedVaultKey: string | null = null;
                let recoveryEncryptedVaultKey: string | null = null;
                let recoveryKeyHash: string | null = null;
                let recoveryKey: string | null = null;

                if (authType !== KeyVaultAuthType.NONE) {
                    const secret = authType === KeyVaultAuthType.PIN ? pin! : password!;
                    authSalt = generateSalt();
                    authHash = hashPassword(secret, authSalt);

                    const vaultKey = generateVaultKey();
                    keySalt = generateSalt();
                    encryptedVaultKey = wrapVaultKey(vaultKey, secret, keySalt);

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
                            connect: { id: ctx.user.id },
                        },
                    },
                });

                return { id: vault.id, name: vault.name, recoveryKey };
            },
            {
                namespace: "server.actions.vaults:createVault",
            },
        ),
    );

