"use server";

import { z } from "zod";

import { getSetting } from "@/lib/app-settings";
import { verifyPassword } from "@/lib/auth/crypto";
import { generateVaultAccessToken, setVaultAccessCookie } from "@/lib/auth/vault/token";
import prisma from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { withLogging } from "@/lib/with-logging";
import { AppSettingKey } from "@/prisma/generated/enums";
import { actionClientWithAuth } from "@/server/actions";

async function incrementVaultLockoutAttempts(lockKey: string, blockDuration: number): Promise<number> {
    const script = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, ttl)
end
return count
`;

    const result = await redis.eval(script, 1, lockKey, blockDuration.toString());
    return Number(result);
}

export const authenticateVault = actionClientWithAuth
    .inputSchema(
        z.object({
            vaultId: z.string().min(1),
            secret: z.string().min(1),
        }),
    )
    .action(
        withLogging(
            async ({ parsedInput: { vaultId, secret }, ctx }, { log }) => {
                log.info("Authenticating vault", { userId: ctx.user.id, vaultId });

                const lockoutEnabled = getSetting(AppSettingKey.VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD);
                const maxAttempts = getSetting(AppSettingKey.VAULT_BLOCK_AFTER_ATTEMPTS);
                const blockDuration = getSetting(AppSettingKey.VAULT_BLOCK_DURATION_SECONDS);

                if (lockoutEnabled) {
                    const lockKey = `vault-lockout:${ctx.user.id}:${vaultId}`;
                    const attempts = await redis.get(lockKey);

                    if (attempts !== null && Number(attempts) >= maxAttempts) {
                        const ttl = await redis.ttl(lockKey);
                        const remaining = ttl > 0 ? ttl : blockDuration;
                        log.warn("Vault auth locked out", {
                            userId: ctx.user.id,
                            vaultId,
                            attempts: Number(attempts),
                            maxAttempts,
                            remainingSeconds: remaining,
                        });
                        throw new Error(`Too many failed attempts. Try again in ${Math.ceil(remaining / 60)} minute(s).`);
                    }
                }

                const vault = await prisma.keyVault.findFirst({
                    where: {
                        id: vaultId,
                        OR: [{ createdById: ctx.user.id }, { users: { some: { userId: ctx.user.id } } }],
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
                    log.warn("Vault authentication failed — incorrect secret", {
                        userId: ctx.user.id,
                        vaultId,
                        authType: vault.authType,
                    });

                    if (lockoutEnabled) {
                        const lockKey = `vault-lockout:${ctx.user.id}:${vaultId}`;
                        const newCount = await incrementVaultLockoutAttempts(lockKey, blockDuration);

                        const remaining = maxAttempts - newCount;

                        if (remaining > 0) {
                            throw new Error(`Invalid password or PIN. ${remaining} attempt(s) remaining.`);
                        }
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

                log.info("Vault authentication succeeded", {
                    userId: ctx.user.id,
                    vaultId,
                    authType: vault.authType,
                });

                return { success: true };
            },
            {
                namespace: "server.actions.vaults:authenticateVault",
            },
        ),
    );

