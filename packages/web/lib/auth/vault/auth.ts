import { getCurrentSession } from "@/lib/auth/session";
import { getVaultAccessCookie, verifyVaultAccessToken } from "@/lib/auth/vault/token";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";

const log = logger.child("server.services.auth:vaultAccess");

/**
 * Checks whether the current user has authenticated access to a vault.
 *
 * - Returns `false` immediately if there is no active user session.
 * - Returns `false` if the vault does not exist in the database.
 * - Returns `true` unconditionally for vaults with `authType === "NONE"`.
 * - For vaults with `authType === "PIN"` or `"PASSWORD"`, reads the vault access
 *   cookie and verifies its HMAC signature, expiry, and that it matches both the
 *   requested vault ID and the current user ID.
 *
 * @param vaultId - The ID of the vault to check access for.
 * @returns `true` if the user has valid access to the vault, `false` otherwise.
 */
export async function requireVaultAccess(vaultId: string): Promise<boolean> {
    const sessionData = await getCurrentSession();
    if (!sessionData) {
        log.debug("Vault access denied — no session", { vaultId });
        return false;
    }

    const userId = sessionData.user.id;

    const vault = await prisma.keyVault.findUnique({
        where: { id: vaultId },
        select: { authType: true },
    });

    if (!vault) {
        log.warn("Vault access denied — vault not found", { vaultId, userId });
        return false;
    }

    if (vault.authType === "NONE") {
        log.debug("Vault access granted — no auth required", { vaultId, userId });
        return true;
    }

    const token = await getVaultAccessCookie(vaultId);
    if (!token) {
        log.debug("Vault access denied — no access cookie", { vaultId, userId, authType: vault.authType });
        return false;
    }

    const payload = verifyVaultAccessToken(token);
    if (!payload) {
        log.warn("Vault access denied — invalid or expired token", { vaultId, userId, authType: vault.authType });
        return false;
    }

    const granted = payload.vaultId === vaultId && payload.userId === userId;
    if (!granted) {
        log.warn("Vault access denied — token mismatch", {
            vaultId,
            userId,
            tokenVaultId: payload.vaultId,
            tokenUserId: payload.userId,
        });
    } else {
        log.debug("Vault access granted via token", { vaultId, userId });
    }

    return granted;
}
