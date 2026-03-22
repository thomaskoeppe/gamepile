import { getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

const log = logger.child("server.services.auth:admin");

/**
 * Requires the current user to have ADMIN role.
 * Throws an error if not authenticated or not an admin.
 */
export async function requireAdmin(): Promise<void> {
    const sessionData = await getCurrentSession();

    if (!sessionData) {
        log.warn("Admin access denied — no session");
        throw new Error("Unauthorized");
    }

    if (sessionData.user.role !== "ADMIN") {
        log.warn("Admin access denied — insufficient role", {
            userId: sessionData.user.id,
            username: sessionData.user.username,
            role: sessionData.user.role,
        });
        throw new Error("Forbidden");
    }

    log.debug("Admin access granted", { userId: sessionData.user.id });
}

/**
 * Returns true if the current user has ADMIN role.
 */
export async function isAdmin(): Promise<boolean> {
    const sessionData = await getCurrentSession();
    const result = sessionData?.user.role === "ADMIN";
    log.debug("Admin check", { isAdmin: result, userId: sessionData?.user.id });
    return result;
}
