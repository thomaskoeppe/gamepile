/**
 * Session lifecycle. Tokens are stored as SHA-256 hashes, so a regression that
 * persisted or compared plaintext would put every live session at risk from a
 * database read.
 */

import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, cookieStore } = vi.hoisted(() => ({
    prismaMock: {
        session: {
            create: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
    cookieStore: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

vi.mock("@/lib/logger", () => {
    const child = () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: () => child(),
    });
    return { logger: { child } };
});

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const USER = { id: "u1", username: "tester", role: "USER" };

function sessionRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "s1",
        userId: "u1",
        token: sha256("raw-token"),
        expiresAt: new Date(Date.now() + 86_400_000),
        lastActivity: new Date(),
        user: USER,
        ...overrides,
    };
}

beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("WEB_SESSION_COOKIE_NAME", "__session");
    vi.stubEnv("WEB_SESSION_DURATION_DAYS", "7");
    prismaMock.session.create.mockReset().mockResolvedValue(sessionRow());
    prismaMock.session.findUnique.mockReset().mockResolvedValue(null);
    prismaMock.session.update.mockReset().mockResolvedValue(sessionRow());
    prismaMock.session.delete.mockReset().mockResolvedValue(sessionRow());
    prismaMock.session.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    cookieStore.set.mockReset();
    cookieStore.get.mockReset().mockReturnValue(undefined);
    cookieStore.delete.mockReset();
});

async function session() {
    return import("@/lib/auth/session");
}

describe("generateSessionToken", () => {
    it("produces a 64-character hex token", async () => {
        const { generateSessionToken } = await session();

        expect(generateSessionToken()).toMatch(/^[a-f0-9]{64}$/);
    });

    it("never repeats a token", async () => {
        const { generateSessionToken } = await session();

        expect(new Set(Array.from({ length: 100 }, generateSessionToken)).size).toBe(100);
    });
});

describe("createUserSession", () => {
    it("stores the hash, never the raw token", async () => {
        const { createUserSession } = await session();

        const { token } = await createUserSession("u1");
        const stored = prismaMock.session.create.mock.calls[0][0].data.token;

        // A database dump must not yield usable session tokens.
        expect(stored).toBe(sha256(token));
        expect(stored).not.toBe(token);
    });

    it("returns the raw token to the caller for the cookie", async () => {
        const { createUserSession } = await session();

        expect((await createUserSession("u1")).token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("sets an expiry from the configured duration", async () => {
        vi.stubEnv("WEB_SESSION_DURATION_DAYS", "3");
        const { createUserSession } = await session();

        await createUserSession("u1");
        const { expiresAt } = prismaMock.session.create.mock.calls[0][0].data;
        const days = (expiresAt.getTime() - Date.now()) / 86_400_000;

        expect(days).toBeGreaterThan(2.9);
        expect(days).toBeLessThan(3.1);
    });

    it("captures the client IP and user agent when a request is supplied", async () => {
        const { createUserSession } = await session();

        await createUserSession(
            "u1",
            new Request("http://localhost/", {
                headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "vitest" },
            }),
        );

        expect(prismaMock.session.create.mock.calls[0][0].data).toMatchObject({
            ipAddress: "203.0.113.9",
            userAgent: "vitest",
        });
    });

    it("records no IP when it cannot be determined", async () => {
        const { createUserSession } = await session();

        await createUserSession("u1", new Request("http://localhost/"));

        expect(prismaMock.session.create.mock.calls[0][0].data.ipAddress).toBeUndefined();
    });
});

describe("validateSessionToken", () => {
    it("looks the token up by its hash", async () => {
        prismaMock.session.findUnique.mockResolvedValue(sessionRow());
        const { validateSessionToken } = await session();

        await validateSessionToken("raw-token");

        expect(prismaMock.session.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { token: sha256("raw-token") } }),
        );
    });

    it("returns the user and session for a valid token", async () => {
        prismaMock.session.findUnique.mockResolvedValue(sessionRow());
        const { validateSessionToken } = await session();

        expect(await validateSessionToken("raw-token")).toMatchObject({ user: USER });
    });

    it("returns null for an unknown token", async () => {
        const { validateSessionToken } = await session();

        expect(await validateSessionToken("nope")).toBeNull();
    });

    it("deletes an expired session rather than honouring it", async () => {
        prismaMock.session.findUnique.mockResolvedValue(sessionRow({ expiresAt: new Date(Date.now() - 1_000) }));
        const { validateSessionToken } = await session();

        expect(await validateSessionToken("raw-token")).toBeNull();
        expect(prismaMock.session.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    });

    it("returns null when the session references a deleted user", async () => {
        prismaMock.session.findUnique.mockResolvedValue(sessionRow({ user: null }));
        const { validateSessionToken } = await session();

        expect(await validateSessionToken("raw-token")).toBeNull();
    });

    it("refreshes lastActivity only after the throttle window", async () => {
        prismaMock.session.findUnique.mockResolvedValue(
            sessionRow({ lastActivity: new Date(Date.now() - 10 * 60_000) }),
        );
        const { validateSessionToken } = await session();

        await validateSessionToken("raw-token");

        expect(prismaMock.session.update).toHaveBeenCalled();
    });

    it("does not write on every request for an active session", async () => {
        prismaMock.session.findUnique.mockResolvedValue(sessionRow({ lastActivity: new Date(Date.now() - 30_000) }));
        const { validateSessionToken } = await session();

        await validateSessionToken("raw-token");

        // Writing per request would put the session table on the hot path.
        expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("migrates a legacy plaintext token to its hash", async () => {
        prismaMock.session.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(sessionRow({ token: "raw-token" }));
        const { validateSessionToken } = await session();

        expect(await validateSessionToken("raw-token")).toMatchObject({ user: USER });
        expect(prismaMock.session.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ token: sha256("raw-token") }) }),
        );
    });
});

describe("session cookie", () => {
    it("sets an httpOnly cookie under the configured name", async () => {
        const { setSessionCookie } = await session();

        await setSessionCookie("raw-token");
        const [name, value, options] = cookieStore.set.mock.calls[0];

        expect(name).toBe("__session");
        expect(value).toBe("raw-token");
        expect(options).toMatchObject({ httpOnly: true });
    });

    it("honours a custom cookie name", async () => {
        vi.stubEnv("WEB_SESSION_COOKIE_NAME", "__gp");
        const { setSessionCookie } = await session();

        await setSessionCookie("raw-token");

        expect(cookieStore.set.mock.calls[0][0]).toBe("__gp");
    });

    it("reads the cookie back", async () => {
        cookieStore.get.mockReturnValue({ value: "raw-token" });
        const { getSessionCookie } = await session();

        expect(await getSessionCookie()).toBe("raw-token");
    });

    it("returns undefined when absent", async () => {
        const { getSessionCookie } = await session();

        expect(await getSessionCookie()).toBeUndefined();
    });

    it("clears the cookie", async () => {
        const { clearSessionCookie } = await session();

        await clearSessionCookie();

        expect(cookieStore.delete).toHaveBeenCalledWith("__session");
    });
});

describe("getCurrentSession", () => {
    it("returns null when no cookie is present, without querying", async () => {
        const { getCurrentSession } = await session();

        expect(await getCurrentSession()).toBeNull();
        expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    });

    it("resolves the session behind the cookie", async () => {
        cookieStore.get.mockReturnValue({ value: "raw-token" });
        prismaMock.session.findUnique.mockResolvedValue(sessionRow());
        const { getCurrentSession } = await session();

        expect(await getCurrentSession()).toMatchObject({ user: USER });
    });
});

describe("invalidateSession", () => {
    it("deletes the session row by token hash and clears the cookie", async () => {
        cookieStore.get.mockReturnValue({ value: "raw-token" });
        const { invalidateSession } = await session();

        await invalidateSession();

        expect(prismaMock.session.deleteMany).toHaveBeenCalled();
        expect(cookieStore.delete).toHaveBeenCalled();
    });

    it("is a no-op when there is no session cookie", async () => {
        const { invalidateSession } = await session();

        await invalidateSession();

        expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
    });
});

describe("formatSessionForClient", () => {
    it("exposes only non-sensitive fields, never the token", async () => {
        const { formatSessionForClient } = await session();

        const formatted = formatSessionForClient(sessionRow() as never);

        expect(JSON.stringify(formatted)).not.toContain(sha256("raw-token"));
        expect(formatted).not.toHaveProperty("token");
    });
});
