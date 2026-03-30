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
const VAULT_KEY_BYTES = 32;
const RECOVERY_KEY_BYTES = 32;

/**
 * Generates a random cryptographic salt as a 64-character hex string (32 bytes).
 */
export function generateSalt(): string {
    return randomBytes(32).toString("hex");
}

/**
 * Derives a secure hash from a password and salt using PBKDF2-SHA512.
 */
export function hashPassword(password: string, salt: string): string {
    return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST).toString("hex");
}

/**
 * Verifies a plaintext password against a stored PBKDF2 hash using constant-time
 * comparison to prevent timing attacks.
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
 * Generates a random 256-bit vault key used to encrypt/decrypt game keys.
 * This key is never stored in plaintext — it is always wrapped (encrypted)
 * by the user's password or a recovery key.
 *
 * @returns A 64-character hex string (32 bytes).
 */
export function generateVaultKey(): string {
    return randomBytes(VAULT_KEY_BYTES).toString("hex");
}

/**
 * Generates a high-entropy recovery key shown to the user once at vault creation.
 *
 * @returns A 64-character hex string (32 bytes / 256 bits of entropy).
 */
export function generateRecoveryKey(): string {
    return randomBytes(RECOVERY_KEY_BYTES).toString("hex");
}

/**
 * Derives a 256-bit AES wrapping key from the user's password and a dedicated
 * key-wrapping salt via PBKDF2-SHA512. This salt (`keySalt`) MUST differ from
 * the `authSalt` used for password verification so the two derived values are
 * cryptographically independent.
 */
function deriveWrappingKey(password: string, keySalt: string): Buffer {
    return pbkdf2Sync(password, keySalt, PBKDF2_ITERATIONS, AES_KEY_LEN, PBKDF2_DIGEST);
}

/**
 * Encrypts (wraps) the raw vault key with a password-derived wrapping key.
 *
 * @returns `iv:authTag:ciphertext` (all hex-encoded, colon-separated).
 */
export function wrapVaultKey(vaultKeyHex: string, password: string, keySalt: string): string {
    const aesKey = deriveWrappingKey(password, keySalt);
    const iv = randomBytes(12);

    const cipher = createCipheriv(AES_ALGO, aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(vaultKeyHex, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(":");
}

/**
 * Decrypts (unwraps) the vault key using the user's password.
 *
 * @returns The raw vault key as a 64-character hex string.
 */
export function unwrapVaultKey(encryptedVaultKey: string, password: string, keySalt: string): string {
    const parts = encryptedVaultKey.split(":");
    if (parts.length !== 3) throw new Error("Invalid encrypted vault key format");

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    const aesKey = deriveWrappingKey(password, keySalt);

    const decipher = createDecipheriv(AES_ALGO, aesKey, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

function deriveRecoveryAesKey(recoveryKey: string): Buffer {
    return createHash("sha256").update(recoveryKey, "utf8").digest();
}

/**
 * Wraps the vault key with the user's recovery key (fast — no PBKDF2).
 *
 * @returns `iv:authTag:ciphertext` (hex-encoded, colon-separated).
 */
export function wrapVaultKeyWithRecovery(vaultKeyHex: string, recoveryKey: string): string {
    const aesKey = deriveRecoveryAesKey(recoveryKey);
    const iv = randomBytes(12);

    const cipher = createCipheriv(AES_ALGO, aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(vaultKeyHex, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(":");
}

/**
 * Unwraps the vault key using the user's recovery key (fast — no PBKDF2).
 *
 * @returns The raw vault key as a hex string.
 */
export function unwrapVaultKeyWithRecovery(encrypted: string, recoveryKey: string): string {
    const parts = encrypted.split(":");
    if (parts.length !== 3) throw new Error("Invalid recovery-encrypted vault key format");

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    const aesKey = deriveRecoveryAesKey(recoveryKey);

    const decipher = createDecipheriv(AES_ALGO, aesKey, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

function vaultKeyToBuffer(vaultKeyHex: string): Buffer {
    const buf = Buffer.from(vaultKeyHex, "hex");
    if (buf.length !== AES_KEY_LEN) throw new Error("Vault key must be 32 bytes");
    return buf;
}

/**
 * Encrypts a plaintext game key with the vault key.
 *
 * @returns `iv:authTag:ciphertext` (hex-encoded, colon-separated).
 */
export function encryptGameKey(plainKey: string, vaultKeyHex: string): string {
    const aesKey = vaultKeyToBuffer(vaultKeyHex);
    const iv = randomBytes(12);

    const cipher = createCipheriv(AES_ALGO, aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plainKey, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(":");
}

/**
 * Decrypts a game key that was encrypted with {@link encryptGameKey}.
 *
 * @returns The plaintext game key string.
 */
export function decryptGameKey(encryptedKey: string, vaultKeyHex: string): string {
    const parts = encryptedKey.split(":");
    if (parts.length !== 3) throw new Error("Invalid encrypted game key format");

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    const aesKey = vaultKeyToBuffer(vaultKeyHex);

    const decipher = createDecipheriv(AES_ALGO, aesKey, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

/**
 * Produces a SHA-512 fingerprint of a plaintext key for deduplication or
 * validation purposes without requiring decryption.
 *
 * @returns A 128-character hex-encoded SHA-512 digest.
 */
export function hashKey(plainKey: string): string {
    return createHash("sha512").update(plainKey).digest("hex");
}
