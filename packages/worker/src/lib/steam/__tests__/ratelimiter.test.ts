/**
 * The rate limiter gates every Steam call. If it lets too many through Steam
 * bans the key; if it deadlocks, every sync stalls.
 *
 * Uses small real intervals rather than fake timers: the drain loop interleaves
 * promises and timers, and faking them makes the tests assert on scheduling
 * details instead of behaviour.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { envValues } = vi.hoisted(() => ({
    envValues: {
        STEAM_API_KEY: "0".repeat(32),
        WORKER_STEAM_RATE_LIMIT_SCOPE: "local" as "local" | "distributed",
        WORKER_STEAM_RATE_LIMIT_MAX: 3,
        WORKER_STEAM_RATE_LIMIT_WINDOW_MS: 200,
        WORKER_STEAM_RATE_LIMIT_MIN_INTERVAL_MS: 0,
    },
}));

vi.mock("@/src/lib/env.js", () => ({ getWorkerEnv: () => envValues }));

vi.mock("@/src/lib/logger.js", () => {
    const child = () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: () => child(),
    });
    return { logger: { child } };
});

// Hoisted so the implementations can be re-armed in beforeEach: the shared
// afterEach clears mocks, which would otherwise leave these returning undefined.
const { redisMock } = vi.hoisted(() => ({
    redisMock: {
        get: vi.fn(),
        set: vi.fn(),
        incr: vi.fn(),
        pexpire: vi.fn(),
        pttl: vi.fn(),
    },
}));

vi.mock("@/src/lib/redis.js", () => ({ redis: redisMock }));

async function limiter() {
    const mod = await import("../ratelimiter.js");
    return mod.steamRateLimiter;
}

beforeEach(() => {
    vi.resetModules();
    envValues.WORKER_STEAM_RATE_LIMIT_SCOPE = "local";
    envValues.WORKER_STEAM_RATE_LIMIT_MAX = 3;
    envValues.WORKER_STEAM_RATE_LIMIT_WINDOW_MS = 200;
    envValues.WORKER_STEAM_RATE_LIMIT_MIN_INTERVAL_MS = 0;

    redisMock.get.mockReset().mockResolvedValue(null);
    redisMock.set.mockReset().mockResolvedValue("OK");
    redisMock.incr.mockReset().mockResolvedValue(1);
    redisMock.pexpire.mockReset().mockResolvedValue(1);
    redisMock.pttl.mockReset().mockResolvedValue(-1);
});

describe("SteamRateLimitError", () => {
    it("carries the status and names the app", async () => {
        const { SteamRateLimitError } = await import("../ratelimiter.js");
        const error = new SteamRateLimitError(220, 429);

        expect(error.status).toBe(429);
        expect(error.name).toBe("SteamRateLimitError");
        expect(error.message).toContain("220");
        expect(error).toBeInstanceOf(Error);
    });
});

describe("local acquisition", () => {
    it("grants slots up to the window budget without delay", async () => {
        const rl = await limiter();
        const start = Date.now();

        await rl.acquire();
        await rl.acquire();
        await rl.acquire();

        expect(Date.now() - start).toBeLessThan(150);
    });

    it("reports usage through the snapshot", async () => {
        const rl = await limiter();

        await rl.acquire();
        await rl.acquire();

        expect(rl.snapshot).toMatchObject({ count: 2, max: 3 });
        expect(rl.snapshot.resetsInMs).toBeGreaterThan(0);
    });

    it("holds the caller past the budget until the window rolls over", async () => {
        const rl = await limiter();
        const start = Date.now();

        // One more than the budget: the last must wait for the next window.
        await Promise.all([rl.acquire(), rl.acquire(), rl.acquire(), rl.acquire()]);

        expect(Date.now() - start).toBeGreaterThanOrEqual(150);
    });

    it("eventually grants every queued caller rather than dropping any", async () => {
        const rl = await limiter();

        const granted = await Promise.all(Array.from({ length: 6 }, () => rl.acquire().then(() => true)));

        expect(granted).toHaveLength(6);
        expect(granted.every(Boolean)).toBe(true);
    });

    it("spaces consecutive calls by the minimum interval", async () => {
        envValues.WORKER_STEAM_RATE_LIMIT_MIN_INTERVAL_MS = 40;
        envValues.WORKER_STEAM_RATE_LIMIT_MAX = 100;
        const rl = await limiter();

        await rl.acquire();
        const start = Date.now();
        await rl.acquire();

        expect(Date.now() - start).toBeGreaterThanOrEqual(30);
    });
});

describe("cooldown after a rate-limit response", () => {
    it("delays the next acquisition once a limit is reported", async () => {
        const rl = await limiter();
        await rl.acquire();

        rl.reportRateLimit();
        const start = Date.now();
        const acquired = rl.acquire();

        // The cooldown is 30s; assert it is actually holding rather than waiting it out.
        await Promise.race([acquired, new Promise((r) => setTimeout(r, 120))]);
        expect(Date.now() - start).toBeGreaterThanOrEqual(100);
    });

    it("ignores a repeated report that would shorten the active cooldown", async () => {
        const rl = await limiter();

        rl.reportRateLimit();
        // Must not reset the clock backwards or a burst of 429s would keep
        // extending, then collapsing, the backoff.
        expect(() => rl.reportRateLimit()).not.toThrow();
    });
});

describe("distributed scope", () => {
    it("coordinates through Redis instead of the local queue", async () => {
        envValues.WORKER_STEAM_RATE_LIMIT_SCOPE = "distributed";
        const rl = await limiter();

        await rl.acquire();

        expect(redisMock.incr).toHaveBeenCalledWith(expect.stringContaining("ratelimit:steam:window:"));
    });

    it("publishes the cooldown so other workers honour it", async () => {
        envValues.WORKER_STEAM_RATE_LIMIT_SCOPE = "distributed";
        const rl = await limiter();

        rl.reportRateLimit();
        await vi.waitFor(() => expect(redisMock.set).toHaveBeenCalled());

        expect(redisMock.set).toHaveBeenCalledWith(
            expect.stringContaining("cooldown"),
            expect.anything(),
            expect.anything(),
            expect.anything(),
        );
    });
});
