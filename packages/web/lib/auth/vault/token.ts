import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const VAULT_TOKEN_EXPIRY_MS = 15 * 60 * 1_000;

/**
 * Retrieves the HMAC signing secret from the `WEB_VAULT_TOKEN_SECRET` environment variable.
 * Falls back to a deterministic derived secret using `WEB_SESSION_COOKIE_NAME` and
 * `NODE_ENV` if the environment variable is not set.
 *
 * @returns The secret string used to sign and verify vault access tokens.
 */
function getSecret(): string {
    const secret = process.env.WEB_VAULT_TOKEN_SECRET;
    if (!secret) {
        return `vault-fallback-${process.env.WEB_SESSION_COOKIE_NAME ?? "__session"}-${process.env.NODE_ENV}`;
    }
    return secret;
}

/**
 * Constructs the per-vault cookie name used to store the vault access token.
 *
 * @param vaultId - The ID of the vault the cookie is scoped to.
 * @returns A cookie name string in the format `__vault_access_<vaultId>`.
 */
function cookieName(vaultId: string): string {
    return `__vault_access_${vaultId}`;
}

/**
 * Generates an HMAC-SHA256 signed vault access token valid for 15 minutes.
 *
 * Token format: `<base64url(payload)>.<hex(signature)>`
 *
 * The payload encodes `vaultId`, `userId`, an expiry timestamp (`exp`), and a
 * random `nonce` to prevent token reuse.
 *
 * @param vaultId - The ID of the vault this token grants access to.
 * @param userId - The ID of the authenticated user the token is issued for.
 * @returns A signed token string that can be stored in a cookie.
 */
export function generateVaultAccessToken(vaultId: string, userId: string): string {
    const payload = {
        vaultId,
        userId,
        exp: Date.now() + VAULT_TOKEN_EXPIRY_MS,
        nonce: randomBytes(8).toString("hex"),
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", getSecret()).update(payloadB64).digest("hex");
    return `${payloadB64}.${sig}`;
}

/**
 * Verifies the signature and expiry of a vault access token produced by
 * {@link generateVaultAccessToken}. Uses constant-time comparison to prevent
 * timing attacks.
 *
 * @param token - The raw token string (as stored in the cookie).
 * @returns An object with `vaultId` and `userId` extracted from the payload if
 *   the token is valid and unexpired, or `null` if the token is malformed,
 *   has an invalid signature, or has expired.
 */
export function verifyVaultAccessToken(
    token: string,
): { vaultId: string; userId: string } | null {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadB64, sig] = parts;
    const expectedSig = createHmac("sha256", getSecret()).update(payloadB64).digest("hex");

    try {
        const sigBuf = Buffer.from(sig, "hex");
        const expectedBuf = Buffer.from(expectedSig, "hex");
        if (sigBuf.length !== expectedBuf.length) return null;
        if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
    } catch {
        return null;
    }

    let payload: { vaultId: string; userId: string; exp: number };
    try {
        payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    } catch {
        return null;
    }

    if (Date.now() > payload.exp) return null;

    return { vaultId: payload.vaultId, userId: payload.userId };
}

/**
 * Persists a vault access token in an `httpOnly` cookie scoped to the given vault.
 * The cookie is set with `sameSite: lax`, is marked `secure` in production, and
 * expires after 15 minutes (`VAULT_TOKEN_EXPIRY_MS`).
 *
 * @param vaultId - The ID of the vault the token grants access to (used to derive the cookie name).
 * @param token - The signed token string returned by {@link generateVaultAccessToken}.
 * @returns A promise that resolves when the cookie has been written.
 */
export async function setVaultAccessCookie(vaultId: string, token: string): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(cookieName(vaultId), token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: Math.floor(VAULT_TOKEN_EXPIRY_MS / 1000),
    });
}

/**
 * Reads the vault access token cookie for the specified vault.
 *
 * @param vaultId - The ID of the vault whose access cookie should be read.
 * @returns The raw token string if the cookie exists, or `undefined` if absent.
 */
export async function getVaultAccessCookie(vaultId: string): Promise<string | undefined> {
    const cookieStore = await cookies();
    return cookieStore.get(cookieName(vaultId))?.value;
}

/**
 * Deletes the vault access cookie for the specified vault, revoking browser-side
 * access. Does not invalidate the token itself on the server.
 *
 * @param vaultId - The ID of the vault whose access cookie should be cleared.
 * @returns A promise that resolves when the cookie has been deleted.
 */
export async function clearVaultAccessCookie(vaultId: string): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(cookieName(vaultId));
}
