import {
    generateSalt,
    hashPassword,
    unwrapVaultKey,
    verifyPassword,
    wrapVaultKey,
} from "@/lib/auth/crypto";

/**
 * Passphrase-gate material stored on a `VaultShare`. Mirrors a vault's own auth
 * fields: `authHash`/`authSalt` verify the share passphrase, while
 * `encryptedVaultKey` (+`keySalt`) holds the vault key re-wrapped under that
 * passphrase so recipients can decrypt game keys without the owner's secret.
 */
export type SharePassphraseMaterial = {
    authHash: string;
    authSalt: string;
    keySalt: string | null;
    encryptedVaultKey: string | null;
};

/**
 * Builds the stored passphrase material for a new share. For `NONE` vaults there
 * is no vault key (game keys are plaintext), so only the passphrase gate is set.
 *
 * @param passphrase - The share passphrase chosen by the owner.
 * @param vaultKeyHex - The raw vault key (from {@link unwrapVaultKeyFromVault}), or `null` for NONE vaults.
 */
export function createSharePassphraseMaterial(
    passphrase: string,
    vaultKeyHex: string | null,
): SharePassphraseMaterial {
    const authSalt = generateSalt();
    const authHash = hashPassword(passphrase, authSalt);

    if (vaultKeyHex === null) {
        return { authHash, authSalt, keySalt: null, encryptedVaultKey: null };
    }

    const keySalt = generateSalt();
    const encryptedVaultKey = wrapVaultKey(vaultKeyHex, passphrase, keySalt);
    return { authHash, authSalt, keySalt, encryptedVaultKey };
}

/**
 * Verifies a recipient's passphrase against a share and unwraps the vault key.
 *
 * @returns The raw vault key hex, or `null` for NONE vaults (plaintext keys).
 * @throws If the passphrase is missing/incorrect or the material is malformed.
 */
export function unwrapShareVaultKey(
    share: {
        authHash: string | null;
        authSalt: string | null;
        keySalt: string | null;
        encryptedVaultKey: string | null;
    },
    passphrase: string,
): string | null {
    if (!share.authHash || !share.authSalt) {
        throw new Error("Share passphrase is not configured");
    }
    if (!verifyPassword(passphrase, share.authSalt, share.authHash)) {
        throw new Error("Incorrect passphrase");
    }
    if (!share.encryptedVaultKey || !share.keySalt) {
        return null; // NONE vault — keys stored in plaintext
    }
    return unwrapVaultKey(share.encryptedVaultKey, passphrase, share.keySalt);
}
