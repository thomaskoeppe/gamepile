/**
 * Redis-backed brute-force protection for vault passphrase entry. If this fails
 * open, an attacker can grind passphrases against an encrypted vault unimpeded.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock, getSetting } = vi.hoisted(() => ({
    redisMock: {
        get: vi.fn(),
        ttl: vi.fn(),
        eval: vi.fn(),
        del: vi.fn(),
    },
    getSetting: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ redis: redisMock, redisOptions: {} }));
vi.mock("@/lib/app-settings", () => ({ getSetting }));

const SETTINGS: Record<string, unknown> = {
    VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD: true,
    VAULT_BLOCK_AFTER_ATTEMPTS: 3,
    VAULT_BLOCK_DURATION_SECONDS: 300,
};

const LOCK_KEY = "vault:lock:v1:u1";

beforeEach(() => {
    vi.resetModules();
    redisMock.get.mockReset().mockResolvedValue(null);
    redisMock.ttl.mockReset().mockResolvedValue(-1);
    redisMock.eval.mockReset().mockResolvedValue(1);
    redisMock.del.mockReset().mockResolvedValue(1);
    getSetting.mockReset().mockImplementation((key: string) => SETTINGS[key]);
});

async function lockout() {
    return import("@/lib/auth/vault/lockout");
}

describe("assertNotLockedOut", () => {
    it("permits entry when no attempts have been recorded", async () => {
        const { assertNotLockedOut } = await lockout();

        await expect(assertNotLockedOut(LOCK_KEY)).resolves.toBeUndefined();
    });

    it("permits entry while below the threshold", async () => {
        redisMock.get.mockResolvedValue("2");
        const { assertNotLockedOut } = await lockout();

        await expect(assertNotLockedOut(LOCK_KEY)).resolves.toBeUndefined();
    });

    it("blocks once the threshold is reached", async () => {
        redisMock.get.mockResolvedValue("3");
        redisMock.ttl.mockResolvedValue(300);
        const { assertNotLockedOut } = await lockout();

        await expect(assertNotLockedOut(LOCK_KEY)).rejects.toThrow(/Too many failed attempts/);
    });

    it("blocks when the counter has run past the threshold", async () => {
        redisMock.get.mockResolvedValue("99");
        const { assertNotLockedOut } = await lockout();

        await expect(assertNotLockedOut(LOCK_KEY)).rejects.toThrow(/Too many failed attempts/);
    });

    it("reports the remaining time from the key's TTL", async () => {
        redisMock.get.mockResolvedValue("3");
        redisMock.ttl.mockResolvedValue(120);
        const { assertNotLockedOut } = await lockout();

        await expect(assertNotLockedOut(LOCK_KEY)).rejects.toThrow(/2 minute/);
    });

    it("falls back to the configured duration when the key has no TTL", async () => {
        redisMock.get.mockResolvedValue("3");
        redisMock.ttl.mockResolvedValue(-1);
        const { assertNotLockedOut } = await lockout();

        // 300s configured -> 5 minutes.
        await expect(assertNotLockedOut(LOCK_KEY)).rejects.toThrow(/5 minute/);
    });

    it("is a no-op when lockout is disabled, without touching Redis", async () => {
        getSetting.mockImplementation((key: string) =>
            key === "VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD" ? false : SETTINGS[key],
        );
        const { assertNotLockedOut } = await lockout();

        await expect(assertNotLockedOut(LOCK_KEY)).resolves.toBeUndefined();
        expect(redisMock.get).not.toHaveBeenCalled();
    });
});

describe("registerFailedAttempt", () => {
    it("counts down the remaining attempts", async () => {
        redisMock.eval.mockResolvedValue(1);
        const { registerFailedAttempt } = await lockout();

        expect(await registerFailedAttempt(LOCK_KEY)).toBe("Incorrect passphrase. 2 attempt(s) remaining.");
    });

    it("switches to a lockout message on the final attempt", async () => {
        redisMock.eval.mockResolvedValue(3);
        const { registerFailedAttempt } = await lockout();

        expect(await registerFailedAttempt(LOCK_KEY)).toMatch(/Too many failed attempts.*5 minute/);
    });

    it("keeps reporting lockout once the counter passes the threshold", async () => {
        redisMock.eval.mockResolvedValue(7);
        const { registerFailedAttempt } = await lockout();

        expect(await registerFailedAttempt(LOCK_KEY)).toMatch(/Too many failed attempts/);
    });

    it("sets a TTL atomically with the increment", async () => {
        const { registerFailedAttempt } = await lockout();
        await registerFailedAttempt(LOCK_KEY);

        // A non-atomic INCR-then-EXPIRE can leave a counter that never expires,
        // locking a user out permanently.
        const [script, numKeys, key, ttl] = redisMock.eval.mock.calls[0];
        expect(String(script)).toContain("INCR");
        expect(String(script)).toContain("EXPIRE");
        expect(numKeys).toBe(1);
        expect(key).toBe(LOCK_KEY);
        expect(ttl).toBe("300");
    });

    it("returns a generic message without counting when lockout is disabled", async () => {
        getSetting.mockImplementation((key: string) =>
            key === "VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD" ? false : SETTINGS[key],
        );
        const { registerFailedAttempt } = await lockout();

        expect(await registerFailedAttempt(LOCK_KEY)).toBe("Incorrect passphrase");
        expect(redisMock.eval).not.toHaveBeenCalled();
    });

    it("never reveals whether the vault or the passphrase was wrong", async () => {
        redisMock.eval.mockResolvedValue(1);
        const { registerFailedAttempt } = await lockout();

        const message = await registerFailedAttempt(LOCK_KEY);

        expect(message).not.toMatch(/vault|user|exist/i);
    });
});

describe("clearLockout", () => {
    it("deletes the counter for the given key", async () => {
        const { clearLockout } = await lockout();

        await clearLockout(LOCK_KEY);

        expect(redisMock.del).toHaveBeenCalledWith(LOCK_KEY);
    });
});
