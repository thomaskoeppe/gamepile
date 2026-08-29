/**
 * The readiness endpoint is what makes a broken deployment visible: the old
 * liveness-only heartbeat returned 200 while every real request was failing, so
 * neither Docker nor Kubernetes ever restarted the container.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const ping = vi.fn();
const areSettingsLoaded = vi.fn();

vi.mock("@/lib/prisma", () => ({
    default: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
}));

vi.mock("@/lib/redis", () => ({
    redis: { ping: (...args: unknown[]) => ping(...args) },
    redisOptions: {},
}));

vi.mock("@/lib/app-settings", () => ({
    areSettingsLoaded: () => areSettingsLoaded(),
}));

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

async function callReady() {
    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    return { response, body: await response.json() };
}

beforeEach(() => {
    vi.resetModules();
    queryRaw.mockReset().mockResolvedValue([{ "?column?": 1 }]);
    ping.mockReset().mockResolvedValue("PONG");
    areSettingsLoaded.mockReset().mockReturnValue(true);
});

describe("GET /api/health/ready", () => {
    it("returns 200 when every dependency is reachable", async () => {
        const { response, body } = await callReady();

        expect(response.status).toBe(200);
        expect(body.status).toBe("ok");
        expect(body.checks.database.status).toBe("ok");
        expect(body.checks.redis.status).toBe("ok");
        expect(body.checks.settings.status).toBe("ok");
    });

    it("returns 503 and names the failure when the database is down", async () => {
        queryRaw.mockRejectedValue(new Error("connection refused"));

        const { response, body } = await callReady();

        expect(response.status).toBe(503);
        expect(body.status).toBe("unavailable");
        expect(body.checks.database.status).toBe("error");
        expect(body.checks.database.error).toContain("connection refused");
        // Healthy dependencies are still reported, so operators can tell them apart.
        expect(body.checks.redis.status).toBe("ok");
    });

    it("returns 503 when Redis is down", async () => {
        ping.mockRejectedValue(new Error("NOAUTH"));

        const { response, body } = await callReady();

        expect(response.status).toBe(503);
        expect(body.checks.redis.status).toBe("error");
    });

    it("returns 503 when both dependencies are down", async () => {
        queryRaw.mockRejectedValue(new Error("db down"));
        ping.mockRejectedValue(new Error("redis down"));

        const { response, body } = await callReady();

        expect(response.status).toBe(503);
        expect(body.checks.database.status).toBe("error");
        expect(body.checks.redis.status).toBe("error");
    });

    it("reports cold settings as degraded without failing readiness", async () => {
        areSettingsLoaded.mockReturnValue(false);

        const { response, body } = await callReady();

        // The app still serves defaults, so this must not pull the pod out of
        // rotation — but it must be visible.
        expect(response.status).toBe(200);
        expect(body.checks.settings.status).toBe("error");
        expect(body.checks.settings.error).toContain("serving defaults");
    });

    it("never caches the result", async () => {
        const { response } = await callReady();

        expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("reports the running version", async () => {
        vi.stubEnv("WEB_APP_VERSION", "9.9.9");

        const { body } = await callReady();

        expect(body.version).toBe("9.9.9");
        vi.unstubAllEnvs();
    });

    it("checks dependencies concurrently rather than serially", async () => {
        queryRaw.mockImplementation(() => new Promise((r) => setTimeout(() => r([1]), 60)));
        ping.mockImplementation(() => new Promise((r) => setTimeout(() => r("PONG"), 60)));

        const start = Date.now();
        await callReady();

        // Serial execution would take ~120ms; allow generous headroom for CI.
        expect(Date.now() - start).toBeLessThan(110);
    });
});
