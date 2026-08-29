/**
 * Route-handler integration tests: each handler is imported and invoked with a
 * real `Request`, against mocked Prisma/Redis. Asserts status codes, response
 * shapes, and the auth rejection paths.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeRequest, routeContext } from "../../../../../test/helpers";

const getCurrentSession = vi.fn();
const consumeRateLimit = vi.fn();
const requireAdmin = vi.fn();

vi.mock("@/lib/auth/session", () => ({
    getCurrentSession: () => getCurrentSession(),
    formatSessionForClient: (session: unknown) => session,
}));

vi.mock("@/lib/auth/admin", () => ({
    requireAdmin: () => requireAdmin(),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
    consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
    getClientIp: () => "203.0.113.5",
    searchLimiter: { points: 40, keyPrefix: "rl:search" },
    authEndpointLimiter: { points: 10, keyPrefix: "rl:auth" },
    globalAnonLimiter: { points: 30, keyPrefix: "rl:global:anon" },
    globalAuthLimiter: { points: 300, keyPrefix: "rl:global:auth" },
}));

const prismaMock = {
    job: { findUnique: vi.fn() },
    jobLog: { findFirst: vi.fn() },
    game: { findMany: vi.fn() },
    userGame: { findMany: vi.fn() },
    keyVaultGame: { findMany: vi.fn() },
    collectionGame: { findMany: vi.fn() },
    category: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/redis", () => ({ redis: { ping: vi.fn() }, redisOptions: {} }));
vi.mock("@/lib/search-query", () => ({ searchGamesRanked: vi.fn().mockResolvedValue([]) }));

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

const SESSION = {
    user: {
        id: "u-1",
        steamId: "76561198000000000",
        username: "tester",
        avatarUrl: null,
        profileUrl: null,
        createdAt: new Date("2026-01-01"),
        role: "USER",
    },
    session: { id: "s-1", expiresAt: new Date("2026-12-31") },
};

beforeEach(() => {
    vi.resetModules();
    getCurrentSession.mockReset().mockResolvedValue(SESSION);
    requireAdmin.mockReset().mockResolvedValue({ id: "admin-1" });
    consumeRateLimit.mockReset().mockResolvedValue({ success: true, limit: 40, remaining: 39, retryAfterMs: 0 });
    Object.values(prismaMock).forEach((model) => {
        if (typeof model === "function") return;
        Object.values(model).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset());
    });
});

describe("GET /api/v1/heartbeat", () => {
    it("responds 200 with the running version and no dependency access", async () => {
        const { GET } = await import("@/app/api/v1/heartbeat/route");
        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.message).toBe("Heartbeat OK");
        expect(body.version).toEqual(expect.any(String));
        // Liveness must stay dependency-free, or a database blip kills the pod.
        expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it("also answers POST", async () => {
        const { POST } = await import("@/app/api/v1/heartbeat/route");
        expect((await POST()).status).toBe(200);
    });
});

describe("GET /api/session", () => {
    it("returns the authenticated user without leaking internal fields", async () => {
        const { GET } = await import("@/app/api/session/route");
        const body = await (await GET()).json();

        expect(body.authenticated).toBe(true);
        expect(body.user).toMatchObject({ id: "u-1", username: "tester", role: "USER" });
        expect(body.user).not.toHaveProperty("email");
    });

    it("returns 200 with authenticated:false when there is no session", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { GET } = await import("@/app/api/session/route");
        const response = await GET();

        // Anonymous is a valid state for this endpoint, not an error.
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ authenticated: false, user: null });
    });

    it("returns 500 without leaking the error detail when the lookup throws", async () => {
        getCurrentSession.mockRejectedValue(new Error("pool timeout on connection 7"));
        const { GET } = await import("@/app/api/session/route");
        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBe("Failed to fetch session");
        expect(JSON.stringify(body)).not.toContain("pool timeout");
    });
});

describe("GET /api/search", () => {
    async function callSearch(url: string) {
        const { GET } = await import("@/app/api/search/route");
        const { NextRequest } = await import("next/server");
        return GET(new NextRequest(url));
    }

    it("rejects anonymous callers with 401", async () => {
        getCurrentSession.mockResolvedValue(null);

        expect((await callSearch("http://localhost:3000/api/search?q=port")).status).toBe(401);
    });

    it("returns 429 with a Retry-After header when rate-limited", async () => {
        consumeRateLimit.mockResolvedValue({ success: false, limit: 40, remaining: 0, retryAfterMs: 30_000 });

        const response = await callSearch("http://localhost:3000/api/search?q=portal");

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("30");
    });

    it("short-circuits to empty results for a query below the minimum length", async () => {
        const response = await callSearch("http://localhost:3000/api/search?q=a");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({ games: [], users: [], tags: [], categories: [] });
        // A one-character query must not reach the database.
        expect(prismaMock.game.findMany).not.toHaveBeenCalled();
    });

    it("treats a missing q parameter as too short rather than erroring", async () => {
        expect((await callSearch("http://localhost:3000/api/search")).status).toBe(200);
    });
});

describe("GET /api/jobs/[id]/status/stream", () => {
    async function callStream(signal?: AbortSignal) {
        const { GET } = await import("@/app/api/jobs/[id]/status/stream/route");
        const req = makeRequest("http://localhost:3000/api/jobs/job-1/status/stream", { signal });
        return GET(req, routeContext({ id: "job-1" }));
    }

    it("rejects anonymous callers with 401", async () => {
        getCurrentSession.mockResolvedValue(null);

        expect((await callStream()).status).toBe(401);
    });

    it("responds with SSE headers for an authenticated caller", async () => {
        prismaMock.job.findUnique.mockResolvedValue(null);
        const controller = new AbortController();

        const response = await callStream(controller.signal);

        expect(response.headers.get("Content-Type")).toBe("text/event-stream");
        expect(response.headers.get("X-Accel-Buffering")).toBe("no");

        controller.abort();
        await response.body?.cancel().catch(() => undefined);
    });

    it("scopes the job lookup to the session user", async () => {
        prismaMock.job.findUnique.mockResolvedValue(null);
        const controller = new AbortController();

        const response = await callStream(controller.signal);
        const reader = response.body!.getReader();
        await reader.read();
        reader.releaseLock();

        // Without the userId filter, any user could stream another user's job.
        expect(prismaMock.job.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "job-1", userId: "u-1" } }),
        );

        controller.abort();
        await response.body?.cancel().catch(() => undefined);
    });

    it("emits an error event when the job is not visible to the caller", async () => {
        prismaMock.job.findUnique.mockResolvedValue(null);
        const controller = new AbortController();

        const response = await callStream(controller.signal);
        const reader = response.body!.getReader();
        const { value } = await reader.read();
        reader.releaseLock();

        expect(new TextDecoder().decode(value)).toContain("Job not found or access denied");

        controller.abort();
    });
});

describe("GET /api/admin/jobs/[id]/stream", () => {
    it("rejects non-admins with 403", async () => {
        requireAdmin.mockRejectedValue(new Error("not an admin"));

        const { GET } = await import("@/app/api/admin/jobs/[id]/stream/route");
        const response = await GET(
            makeRequest("http://localhost:3000/api/admin/jobs/job-1/stream"),
            routeContext({ id: "job-1" }),
        );

        expect(response.status).toBe(403);
    });

    it("streams for an admin caller", async () => {
        prismaMock.jobLog.findFirst.mockResolvedValue(null);
        prismaMock.job.findUnique.mockResolvedValue(null);
        const controller = new AbortController();

        const { GET } = await import("@/app/api/admin/jobs/[id]/stream/route");
        const response = await GET(
            makeRequest("http://localhost:3000/api/admin/jobs/job-1/stream", { signal: controller.signal }),
            routeContext({ id: "job-1" }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("text/event-stream");

        controller.abort();
        await response.body?.cancel().catch(() => undefined);
    });
});
