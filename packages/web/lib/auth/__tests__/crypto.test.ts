/**
 * The vault crypto helpers protect user-supplied game keys at rest. These tests
 * pin the round-trip behaviour and the tamper/wrong-secret rejection paths.
 */

import { describe, expect, it } from "vitest";

import {
    decryptGameKey,
    encryptGameKey,
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

describe("password hashing", () => {
    it("verifies a correct password", () => {
        const salt = generateSalt();
        const hash = hashPassword("correct horse battery staple", salt);

        expect(verifyPassword("correct horse battery staple", salt, hash)).toBe(true);
    });

    it("rejects a wrong password", () => {
        const salt = generateSalt();
        const hash = hashPassword("right", salt);

        expect(verifyPassword("wrong", salt, hash)).toBe(false);
    });

    it("rejects a correct password under a different salt", () => {
        const hash = hashPassword("secret", generateSalt());

        expect(verifyPassword("secret", generateSalt(), hash)).toBe(false);
    });

    it("returns false rather than throwing on a malformed stored hash", () => {
        const salt = generateSalt();

        expect(verifyPassword("secret", salt, "not-hex")).toBe(false);
        expect(verifyPassword("secret", salt, "")).toBe(false);
    });

    it("produces a distinct salt every call", () => {
        const salts = new Set(Array.from({ length: 50 }, () => generateSalt()));

        expect(salts.size).toBe(50);
        expect([...salts].every((s) => /^[a-f0-9]{64}$/.test(s))).toBe(true);
    });
});

describe("vault key wrapping", () => {
    it("round-trips the vault key through a password", () => {
        const vaultKey = generateVaultKey();
        const salt = generateSalt();

        const wrapped = wrapVaultKey(vaultKey, "hunter2", salt);

        expect(wrapped).not.toContain(vaultKey);
        expect(unwrapVaultKey(wrapped, "hunter2", salt)).toBe(vaultKey);
    });

    it("fails to unwrap with the wrong password", () => {
        const vaultKey = generateVaultKey();
        const salt = generateSalt();
        const wrapped = wrapVaultKey(vaultKey, "hunter2", salt);

        expect(() => unwrapVaultKey(wrapped, "hunter3", salt)).toThrow();
    });

    it("rejects a malformed wrapped payload", () => {
        expect(() => unwrapVaultKey("garbage", "hunter2", generateSalt())).toThrow(
            "Invalid encrypted vault key format",
        );
    });

    it("detects tampering via the GCM auth tag", () => {
        const vaultKey = generateVaultKey();
        const salt = generateSalt();
        const [iv, authTag, ciphertext] = wrapVaultKey(vaultKey, "hunter2", salt).split(":");

        // Flip the final ciphertext nibble.
        const flipped = ciphertext.slice(0, -1) + (ciphertext.at(-1) === "0" ? "1" : "0");

        expect(() => unwrapVaultKey(`${iv}:${authTag}:${flipped}`, "hunter2", salt)).toThrow();
    });

    it("round-trips through a recovery key", () => {
        const vaultKey = generateVaultKey();
        const recoveryKey = generateRecoveryKey();

        const wrapped = wrapVaultKeyWithRecovery(vaultKey, recoveryKey);

        expect(unwrapVaultKeyWithRecovery(wrapped, recoveryKey)).toBe(vaultKey);
        expect(() => unwrapVaultKeyWithRecovery(wrapped, generateRecoveryKey())).toThrow();
    });

    it("generates unique vault and recovery keys", () => {
        expect(new Set(Array.from({ length: 25 }, generateVaultKey)).size).toBe(25);
        expect(new Set(Array.from({ length: 25 }, generateRecoveryKey)).size).toBe(25);
    });
});

describe("game key encryption", () => {
    it("round-trips a game key", () => {
        const vaultKey = generateVaultKey();
        const plain = "ABCDE-12345-FGHIJ";

        const encrypted = encryptGameKey(plain, vaultKey);

        expect(encrypted).not.toContain(plain);
        expect(decryptGameKey(encrypted, vaultKey)).toBe(plain);
    });

    it("cannot be decrypted with a different vault key", () => {
        const encrypted = encryptGameKey("ABCDE-12345-FGHIJ", generateVaultKey());

        expect(() => decryptGameKey(encrypted, generateVaultKey())).toThrow();
    });

    it("produces different ciphertext for the same input (random IV)", () => {
        const vaultKey = generateVaultKey();

        expect(encryptGameKey("same", vaultKey)).not.toBe(encryptGameKey("same", vaultKey));
    });

    it("hashes keys deterministically for duplicate detection", () => {
        expect(hashKey("ABCDE-12345")).toBe(hashKey("ABCDE-12345"));
        expect(hashKey("ABCDE-12345")).not.toBe(hashKey("ABCDE-12346"));
    });
});
