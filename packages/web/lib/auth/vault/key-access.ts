import { unwrapVaultKey, verifyPassword } from "@/lib/auth/crypto";
import { KeyVaultAuthType } from "@/prisma/generated/enums";

/**
 * Verifies a caller's secret against a vault's stored credentials and unwraps the
 * raw vault key used to encrypt/decrypt game keys.
 *
 * Shared by the key actions (`server/actions/vault-keys.ts`) and the sharing
 * feature (`server/actions/vault-shares.ts`), which re-wraps the returned key
 * under a share passphrase.
 *
 * @returns The raw vault key as a hex string, or `null` for `NONE` vaults (whose
 *   game keys are stored in plaintext).
 * @throws If the secret is missing/incorrect or the vault key material is absent.
 */
export function unwrapVaultKeyFromVault(params: {
    authType: KeyVaultAuthType;
    authHash: string | null;
    authSalt: string | null;
    keySalt: string | null;
    encryptedVaultKey: string | null;
    secret?: string;
}): string | null {
    const { authType, authHash, authSalt, keySalt, encryptedVaultKey, secret } = params;

    if (authType === KeyVaultAuthType.NONE) {
        return null; // NONE vaults store keys in plaintext
    }

    if (!secret) {
        throw new Error("Secret is required for this vault");
    }
    if (!authHash || !authSalt) {
        throw new Error("Vault authentication is not properly configured");
    }
    if (!encryptedVaultKey || !keySalt) {
        throw new Error("Vault key material is missing");
    }

    const verified = verifyPassword(secret, authSalt, authHash);
    if (!verified) {
        throw new Error("Incorrect secret");
    }

    return unwrapVaultKey(encryptedVaultKey, secret, keySalt);
}
