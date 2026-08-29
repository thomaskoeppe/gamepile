/**
 * Vault access tokens gate decryption of stored game keys. A forged or expired
 * token that verified would hand an attacker the contents of someone's vault.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

const SECRET = "a-test-secret-at-least-32-characters-long";

beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("WEB_VAULT_TOKEN_SECRET", SECRET);
    cookieStore.set.mockReset();
    cookieStore.get.mockReset();
    cookieStore.delete.mockReset();
});

async function tokenModule() {
    return import("@/lib/auth/vault/token");
}

describe("generateVaultAccessToken", () => {
    it("produces a payload.signature pair", async () => {
        const { generateVaultAccessToken } = await tokenModule();

        expect(generateVaultAccessToken("v1", "u1").split(".")).toHaveLength(2);
    });

    it("issues a distinct token every call, so one cannot be replayed as another", async () => {
        const { generateVaultAccessToken } = await tokenModule();

        const tokens = new Set(Array.from({ length: 20 }, () => generateVaultAccessToken("v1", "u1")));

        expect(tokens.size).toBe(20);
    });

    it("throws when the signing secret is not configured", async () => {
        vi.stubEnv("WEB_VAULT_TOKEN_SECRET", "");
        const { generateVaultAccessToken } = await tokenModule();

        // Failing closed is correct: silently signing with an empty key would
        // make every token forgeable.
        expect(() => generateVaultAccessToken("v1", "u1")).toThrow(/WEB_VAULT_TOKEN_SECRET/);
    });
});

describe("verifyVaultAccessToken", () => {
    it("round-trips a freshly issued token", async () => {
        const { generateVaultAccessToken, verifyVaultAccessToken } = await tokenModule();

        expect(verifyVaultAccessToken(generateVaultAccessToken("v1", "u1"))).toEqual({
            vaultId: "v1",
            userId: "u1",
        });
    });

    it.each([
        ["empty string", ""],
        ["no separator", "abcdef"],
        ["too many parts", "a.b.c"],
        ["empty payload", ".deadbeef"],
        ["non-base64 payload", "!!!.deadbeef"],
    ])("rejects a malformed token: %s", async (_label, token) => {
        const { verifyVaultAccessToken } = await tokenModule();

        expect(verifyVaultAccessToken(token)).toBeNull();
    });

    it("rejects a token whose signature has been altered", async () => {
        const { generateVaultAccessToken, verifyVaultAccessToken } = await tokenModule();
        const [payload, sig] = generateVaultAccessToken("v1", "u1").split(".");
        const forged = sig.slice(0, -1) + (sig.at(-1) === "0" ? "1" : "0");

        expect(verifyVaultAccessToken(`${payload}.${forged}`)).toBeNull();
    });

    it("rejects a token whose payload has been altered to name another vault", async () => {
        const { generateVaultAccessToken, verifyVaultAccessToken } = await tokenModule();
        const [, sig] = generateVaultAccessToken("v1", "u1").split(".");

        // The attack this defends against: swap the vaultId, keep the signature.
        const tamperedPayload = Buffer.from(
            JSON.stringify({ vaultId: "someone-elses-vault", userId: "u1", exp: Date.now() + 60_000, nonce: "x" }),
        ).toString("base64url");

        expect(verifyVaultAccessToken(`${tamperedPayload}.${sig}`)).toBeNull();
    });

    it("rejects a token signed with a different secret", async () => {
        const { generateVaultAccessToken } = await tokenModule();
        const token = generateVaultAccessToken("v1", "u1");

        vi.resetModules();
        vi.stubEnv("WEB_VAULT_TOKEN_SECRET", "a-completely-different-secret-value-here");
        const { verifyVaultAccessToken } = await tokenModule();

        expect(verifyVaultAccessToken(token)).toBeNull();
    });

    it("rejects an expired token", async () => {
        vi.useFakeTimers();
        const { generateVaultAccessToken, verifyVaultAccessToken } = await tokenModule();
        const token = generateVaultAccessToken("v1", "u1");

        expect(verifyVaultAccessToken(token)).not.toBeNull();

        // Tokens are valid for 15 minutes.
        vi.advanceTimersByTime(16 * 60 * 1_000);
        expect(verifyVaultAccessToken(token)).toBeNull();

        vi.useRealTimers();
    });

    it("rejects a signature of the wrong length without throwing", async () => {
        const { generateVaultAccessToken, verifyVaultAccessToken } = await tokenModule();
        const [payload] = generateVaultAccessToken("v1", "u1").split(".");

        // timingSafeEqual throws on length mismatch if the guard is missing.
        expect(() => verifyVaultAccessToken(`${payload}.abcd`)).not.toThrow();
        expect(verifyVaultAccessToken(`${payload}.abcd`)).toBeNull();
    });
});

describe("vault access cookies", () => {
    it("scopes the cookie to the vault and hardens its flags", async () => {
        const { setVaultAccessCookie } = await tokenModule();

        await setVaultAccessCookie("v1", "token-value");

        const [name, value, options] = cookieStore.set.mock.calls[0];
        expect(name).toBe("__vault_access_v1");
        expect(value).toBe("token-value");
        expect(options).toMatchObject({ httpOnly: true, sameSite: "lax" });
    });

    it("reads back the cookie for the matching vault", async () => {
        cookieStore.get.mockReturnValue({ value: "stored" });
        const { getVaultAccessCookie } = await tokenModule();

        expect(await getVaultAccessCookie("v1")).toBe("stored");
        expect(cookieStore.get).toHaveBeenCalledWith("__vault_access_v1");
    });

    it("returns undefined when no cookie is present", async () => {
        cookieStore.get.mockReturnValue(undefined);
        const { getVaultAccessCookie } = await tokenModule();

        expect(await getVaultAccessCookie("v1")).toBeUndefined();
    });

    it("clears only the cookie for the given vault", async () => {
        const { clearVaultAccessCookie } = await tokenModule();

        await clearVaultAccessCookie("v1");

        expect(cookieStore.delete).toHaveBeenCalledWith("__vault_access_v1");
    });
});
