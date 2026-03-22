import {
    createCipheriv,
    createDecipheriv,
    createHash,
    pbkdf2Sync,
    randomBytes,
    timingSafeEqual,
} from "crypto";

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEY_LEN = 64;
const PBKDF2_DIGEST = "sha512";
const AES_ALGO = "aes-256-gcm";
const AES_KEY_LEN = 32;

/**
 * Generates a random cryptographic salt as a 64-character hex string (32 bytes).
 *
 * @returns A hex-encoded random salt string suitable for use with {@link hashPassword}.
 */
export function generateSalt(): string {
    return randomBytes(32).toString("hex");
}

/**
 * Derives a secure hash from a password and salt using PBKDF2-SHA512.
 * Uses {@link PBKDF2_ITERATIONS} iterations and produces a {@link PBKDF2_KEY_LEN}-byte key.
 *
 * @param password - The plaintext password to hash.
 * @param salt - A hex-encoded salt string (e.g., from {@link generateSalt}).
 * @returns A hex-encoded PBKDF2 hash string.
 */
export function hashPassword(password: string, salt: string): string {
    return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST).toString("hex");
}

/**
 * Verifies a plaintext password against a stored PBKDF2 hash using constant-time
 * comparison to prevent timing attacks.
 *
 * @param password - The plaintext password provided by the user.
 * @param salt - The hex-encoded salt originally used to hash the password.
 * @param hash - The hex-encoded stored hash to compare against.
 * @returns `true` if the password matches the hash, `false` otherwise.
 */
export function verifyPassword(password: string, salt: string, hash: string): boolean {
    const computed = hashPassword(password, salt);
    try {
        const computedBuf = Buffer.from(computed, "hex");
        const hashBuf = Buffer.from(hash, "hex");
        if (computedBuf.length !== hashBuf.length) return false;
        return timingSafeEqual(computedBuf, hashBuf);
    } catch {
        return false;
    }
}

/**
 * Encrypts a plaintext key string using AES-256-GCM with a PBKDF2-derived key.
 *
 * A random 96-bit IV and 128-bit key-salt are generated per call, so two
 * encryptions of the same input with the same password produce different output.
 * The GCM authentication tag protects against ciphertext tampering.
 *
 * @param plainKey - The plaintext key string to encrypt.
 * @param password - The password used to derive the AES-256 encryption key via PBKDF2.
 * @returns A colon-separated hex string in the format `iv:keySalt:authTag:ciphertext`.
 */
export function encryptKey(plainKey: string, password: string): string {
    const iv = randomBytes(12);
    const keySalt = randomBytes(16);
    const aesKey = pbkdf2Sync(password, keySalt, PBKDF2_ITERATIONS, AES_KEY_LEN, PBKDF2_DIGEST);

    const cipher = createCipheriv(AES_ALGO, aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plainKey, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
        iv.toString("hex"),
        keySalt.toString("hex"),
        authTag.toString("hex"),
        ciphertext.toString("hex"),
    ].join(":");
}

/**
 * Decrypts a key that was previously encrypted with {@link encryptKey}.
 * Derives the AES-256 key from the password and verifies the GCM authentication
 * tag before returning the plaintext.
 *
 * @param encryptedKey - The colon-separated hex string produced by {@link encryptKey}
 *   (`iv:keySalt:authTag:ciphertext`).
 * @param password - The password used to originally encrypt the key.
 * @returns The decrypted plaintext key string.
 * @throws {Error} If `encryptedKey` does not contain exactly four colon-separated
 *   segments (invalid format).
 * @throws {Error} If the GCM authentication tag verification fails, indicating
 *   a corrupt or tampered ciphertext.
 */
export function decryptKey(encryptedKey: string, password: string): string {
    const parts = encryptedKey.split(":");
    if (parts.length !== 4) {
        throw new Error("Invalid encrypted key format");
    }
    const [ivHex, keySaltHex, authTagHex, ciphertextHex] = parts;

    const iv = Buffer.from(ivHex, "hex");
    const keySalt = Buffer.from(keySaltHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");

    const aesKey = pbkdf2Sync(password, keySalt, PBKDF2_ITERATIONS, AES_KEY_LEN, PBKDF2_DIGEST);

    const decipher = createDecipheriv(AES_ALGO, aesKey, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

/**
 * Produces a SHA-512 fingerprint of a plaintext key for deduplication or
 * validation purposes without requiring decryption.
 *
 * @param plainKey - The plaintext key string to hash.
 * @returns A 128-character hex-encoded SHA-512 digest.
 */
export function hashKey(plainKey: string): string {
    return createHash("sha512").update(plainKey).digest("hex");
}
