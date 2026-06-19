import { getSetting } from "@/lib/app-settings";
import { redis } from "@/lib/redis";
import { AppSettingKey } from "@/prisma/generated/enums";

/**
 * Redis-backed brute-force protection for vault/share passphrase entry, reusing
 * the same admin settings as the vault unlock flow (`authenticateVault`).
 */

const INCR_WITH_TTL = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, ttl)
end
return count
`;

/** Throws if the given lock key is currently over the failed-attempt threshold. */
export async function assertNotLockedOut(lockKey: string): Promise<void> {
    if (!getSetting(AppSettingKey.VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD)) {
        return;
    }

    const maxAttempts = getSetting(AppSettingKey.VAULT_BLOCK_AFTER_ATTEMPTS);
    const attempts = await redis.get(lockKey);

    if (attempts !== null && Number(attempts) >= maxAttempts) {
        const ttl = await redis.ttl(lockKey);
        const remaining = ttl > 0 ? ttl : getSetting(AppSettingKey.VAULT_BLOCK_DURATION_SECONDS);
        throw new Error(`Too many failed attempts. Try again in ${Math.ceil(remaining / 60)} minute(s).`);
    }
}

/**
 * Records a failed attempt and returns a human-readable error to throw, or `null`
 * when lockout is disabled.
 */
export async function registerFailedAttempt(lockKey: string): Promise<string> {
    if (!getSetting(AppSettingKey.VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD)) {
        return "Incorrect passphrase";
    }

    const maxAttempts = getSetting(AppSettingKey.VAULT_BLOCK_AFTER_ATTEMPTS);
    const blockDuration = getSetting(AppSettingKey.VAULT_BLOCK_DURATION_SECONDS);
    const count = Number(await redis.eval(INCR_WITH_TTL, 1, lockKey, blockDuration.toString()));
    const remaining = maxAttempts - count;

    if (remaining > 0) {
        return `Incorrect passphrase. ${remaining} attempt(s) remaining.`;
    }
    return `Too many failed attempts. Try again in ${Math.ceil(blockDuration / 60)} minute(s).`;
}

/** Clears the failed-attempt counter after a successful unlock. */
export async function clearLockout(lockKey: string): Promise<void> {
    await redis.del(lockKey);
}
