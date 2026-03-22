import { createHash,randomBytes } from "crypto";
import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import {Session, User} from "@/prisma/generated/client";

const log = logger.child("server.services.auth:session");

export interface SessionData {
    user: User
    session: Session
}

/**
 * Generates a cryptographically secure session token.
 * Combines 32 random bytes with the current timestamp, then hashes the result
 * with SHA-256 to produce a 64-character hex string.
 *
 * @returns A 64-character hex-encoded session token.
 */
export function generateSessionToken(): string {
    const randomData = randomBytes(32);
    const timestamp = Date.now().toString();
    const combined = `${randomData.toString("hex")}-${timestamp}`;
    return createHash("sha256").update(combined).digest("hex");
}

/**
 * Creates a new session record in the database for the given user.
 * Generates a fresh token, sets the expiry from `SESSION_DURATION_DAYS`
 * (defaulting to 7), and optionally captures the client IP and user-agent
 * from the originating request.
 *
 * @param userId - The ID of the user to create the session for.
 * @param request - Optional incoming HTTP request used to extract IP address
 *   (`x-forwarded-for` or `x-real-ip`) and `user-agent` headers.
 * @returns The newly created `Session` record.
 */
export async function createUserSession(
    userId: string,
    request?: Request
): Promise<Session> {
    const token = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(process.env.WEB_SESSION_DURATION_DAYS || "7"));

    let ipAddress: string | undefined;
    let userAgent: string | undefined;

    if (request) {
        ipAddress =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            request.headers.get("x-real-ip") ||
            undefined;
        userAgent = request.headers.get("user-agent") || undefined;
    }

    log.info("Creating user session", {
        userId,
        ipAddress: ipAddress ?? "unknown",
        expiresAt: expiresAt.toISOString(),
    });

    const session = await prisma.session.create({
        data: {
            user: { connect: { id: userId } },
            token,
            expiresAt,
            ipAddress,
            userAgent,
        },
    });

    log.info("User session created", { userId, sessionId: session.id });
    return session;
}

/**
 * Writes the session token into an `httpOnly` cookie.
 * Cookie name is read from `WEB_SESSION_COOKIE_NAME` (default `__session`).
 * Expiry matches the session duration set by `WEB_SESSION_DURATION_DAYS` (default 7 days).
 *
 * @param token - The session token string to store in the cookie.
 * @returns A promise that resolves when the cookie has been set.
 */
export async function setSessionCookie(token: string): Promise<void> {
    const cookieStore = await cookies();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(process.env.WEB_SESSION_DURATION_DAYS || "7"));

    cookieStore.set(process.env.WEB_SESSION_COOKIE_NAME || "__session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
    });
}

/**
 * Reads the raw session token from the request cookies.
 * Cookie name is determined by the `WEB_SESSION_COOKIE_NAME` environment variable
 * (default `__session`).
 *
 * @returns The session token string, or `undefined` if the cookie is absent.
 */
export async function getSessionCookie(): Promise<string | undefined> {
    const cookieStore = await cookies();
    return cookieStore.get(process.env.WEB_SESSION_COOKIE_NAME || "__session")?.value;
}

/**
 * Deletes the session cookie from the response, effectively logging the user out
 * at the browser level. Does not touch the database record.
 *
 * @returns A promise that resolves when the cookie has been cleared.
 */
export async function clearSessionCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(process.env.WEB_SESSION_COOKIE_NAME || "__session");
}

/**
 * Resolves the full session and user for the current request by reading the
 * session cookie and validating it against the database.
 *
 * Side effects:
 * - Clears the session cookie and deletes the DB record if the session or user
 *   is no longer valid, or if the session has expired.
 * - Updates `Session.lastActivity` on every successful validation.
 *
 * @returns A `SessionData` object containing the resolved `User` and `Session`,
 *   or `null` if no valid session exists.
 */
export async function getCurrentSession(): Promise<SessionData | null> {
    const token = await getSessionCookie();
    if (!token) {
        log.debug("No session cookie present");
        return null;
    }

    const session = await prisma.session.findUnique({
        where: { token },
    });

    if (!session) {
        log.warn("Session cookie present but no matching DB record — clearing cookie", {
            tokenPrefix: token.slice(0, 8) + "…",
        });
        await clearSessionCookie();
        return null;
    }

    if (session.expiresAt < new Date()) {
        log.info("Session expired — deleting and clearing cookie", {
            sessionId: session.id,
            userId: session.userId,
            expiredAt: session.expiresAt.toISOString(),
        });
        await prisma.session.delete({ where: { id: session.id } });
        await clearSessionCookie();
        return null;
    }

    const user = await prisma.user.findUnique({
        where: { id: session.userId }
    });

    if (!user) {
        log.warn("Session references non-existent user — deleting session", {
            sessionId: session.id,
            userId: session.userId,
        });
        await prisma.session.delete({
            where: { id: session.id },
        });

        await clearSessionCookie();
        return null;
    }

    await prisma.session.update({
        where: { id: session.id },
        data: { lastActivity: new Date() },
    });

    log.debug("Session validated", {
        sessionId: session.id,
        userId: user.id,
        username: user.username,
    });

    return { user, session };
}

/**
 * Validates a session token passed directly (e.g., from an `Authorization` header
 * in an API request) without relying on cookies.
 * Updates `Session.lastActivity` on success.
 *
 * @param token - The raw session token string to validate.
 * @returns A `SessionData` object if the token maps to a valid session and user,
 *   or `null` if the token is unknown or the associated user no longer exists.
 */
export async function validateSessionToken(
    token: string
): Promise<SessionData | null> {
    log.debug("Validating session token", { tokenPrefix: token.slice(0, 8) + "…" });

    const session = await prisma.session.findUnique({
        where: { token },
    });

    if (!session) {
        log.debug("Session token not found in database");
        return null;
    }

    if (session.expiresAt < new Date()) {
        log.info("Session token expired — deleting", {
            sessionId: session.id,
            userId: session.userId,
            expiredAt: session.expiresAt.toISOString(),
        });
        await prisma.session.delete({ where: { id: session.id } });
        return null;
    }

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
    });

    if (!user) {
        log.warn("Session token references non-existent user", {
            sessionId: session.id,
            userId: session.userId,
        });
        return null;
    }

    await prisma.session.update({
        where: { id: session.id },
        data: { lastActivity: new Date() },
    });

    log.debug("Session token validated", { sessionId: session.id, userId: user.id });
    return { user, session };
}

/**
 * Invalidates the current session by deleting the database record and clearing
 * the session cookie. No-op if no session cookie is present.
 *
 * @returns A promise that resolves when the session has been fully invalidated.
 */
export async function invalidateSession(): Promise<void> {
    const token = await getSessionCookie();
    if (token) {
        log.info("Invalidating session", { tokenPrefix: token.slice(0, 8) + "…" });
        await prisma.session.delete({
            where: { token },
        });
        await clearSessionCookie();
        log.info("Session invalidated and cookie cleared");
    } else {
        log.debug("No session to invalidate — cookie absent");
    }
}

/**
 * Produces a safe, client-facing representation of a session by stripping
 * sensitive fields and partially masking the stored IP address.
 *
 * @param session - The raw `Session` record from the database.
 * @returns A plain object containing `id`, `expiresAt`, a masked `ipAddress`
 *   (or `null`), `userAgent`, `createdAt`, and `lastActivity`.
 */
export function formatSessionForClient(session: Session) {
    return {
        id: session.id,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress ? maskIpAddress(session.ipAddress) : null,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
    };
}

/**
 * Masks an IP address for privacy before sending it to clients.
 * For IPv4 addresses, replaces the last two octets with `***`.
 * For all other formats (e.g. IPv6), replaces the second half with `***`.
 *
 * @param ip - The raw IP address string to mask.
 * @returns A partially redacted IP address string.
 */
function maskIpAddress(ip: string): string {
    const parts = ip.split(".");
    if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.***.***`;
    }
    return ip.substring(0, ip.length / 2) + "***";
}
