/**
 * Achievement endpoints. This client already used defensive optional chaining,
 * so it survived empty envelopes — but its success-path `response.json()` was
 * unguarded, and neither endpoint validated the entries it returned.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { HTML_MAINTENANCE_PAGE, jsonResponse, textResponse } from "./fixtures/steam.js";

vi.mock("@/src/lib/env.js", () => ({
    getWorkerEnv: () => ({
        STEAM_API_KEY: "0".repeat(32),
        WORKER_STEAM_RATE_LIMIT_SCOPE: "local",
        WORKER_STEAM_RATE_LIMIT_MAX: 200,
        WORKER_STEAM_RATE_LIMIT_WINDOW_MS: 300000,
        WORKER_STEAM_RATE_LIMIT_MIN_INTERVAL_MS: 0,
    }),
}));

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

const { reportRateLimit } = vi.hoisted(() => ({ reportRateLimit: vi.fn() }));

vi.mock("@/src/lib/steam/ratelimiter.js", async () => {
    const actual = await vi.importActual<typeof import("../ratelimiter.js")>("../ratelimiter.js");
    return {
        SteamRateLimitError: actual.SteamRateLimitError,
        steamRateLimiter: { acquire: vi.fn().mockResolvedValue(undefined), reportRateLimit },
    };
});

const fetchMock = vi.fn();

beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    reportRateLimit.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

async function schema(appId = 220) {
    const { fetchGameAchievementSchema } = await import("../achievements.js");
    return fetchGameAchievementSchema(appId);
}

async function player(steamId = "76561198000000000", appId = 220) {
    const { fetchPlayerAchievements } = await import("../achievements.js");
    return fetchPlayerAchievements(steamId, appId);
}

const VALID_DEF = {
    name: "ACH_WIN",
    displayName: "Winner",
    description: "Win a game",
    icon: "https://cdn/icon.jpg",
    icongray: "https://cdn/gray.jpg",
    hidden: 0,
};

describe("fetchGameAchievementSchema", () => {
    it.each([
        ["empty object", {}],
        ["null game", { game: null }],
        ["game without stats", { game: {} }],
        ["stats without achievements", { game: { availableGameStats: {} } }],
        ["achievements not an array", { game: { availableGameStats: { achievements: {} } } }],
        ["top-level null", null],
    ])("returns an empty list for %s", async (_label, payload) => {
        fetchMock.mockResolvedValue(jsonResponse(payload));

        expect(await schema()).toEqual([]);
    });

    it("returns well-formed definitions", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ game: { availableGameStats: { achievements: [VALID_DEF] } } }));

        const defs = await schema();

        expect(defs).toHaveLength(1);
        expect(defs[0]).toMatchObject({ name: "ACH_WIN", displayName: "Winner" });
    });

    it("keeps valid definitions and drops entries with no name", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                game: {
                    availableGameStats: {
                        achievements: [VALID_DEF, { displayName: "Nameless" }, { ...VALID_DEF, name: "ACH_TWO" }],
                    },
                },
            }),
        );

        // One malformed definition must not cost the game its whole achievement set.
        expect((await schema()).map((a) => a.name)).toEqual(["ACH_WIN", "ACH_TWO"]);
    });

    it("defaults optional display fields Steam omits for hidden achievements", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ game: { availableGameStats: { achievements: [{ name: "ACH_HIDDEN" }] } } }),
        );

        expect((await schema())[0]).toMatchObject({ name: "ACH_HIDDEN", displayName: "", hidden: 0 });
    });

    it("reports an HTML maintenance page as a Steam error", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(textResponse(HTML_MAINTENANCE_PAGE, 200)));

        await expect(schema()).rejects.toThrow(/non-JSON response from ISteamUserStats/);
    });

    it.each([429, 403])("raises SteamRateLimitError on HTTP %i", async (status) => {
        fetchMock.mockResolvedValue(textResponse("limited", status, "text/plain"));

        await expect(schema()).rejects.toThrow(/rate-limited/);
        expect(reportRateLimit).toHaveBeenCalled();
    });
});

describe("fetchPlayerAchievements", () => {
    it("returns unlock entries on success", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                playerstats: {
                    success: true,
                    achievements: [{ apiname: "ACH_WIN", achieved: 1, unlocktime: 1_700_000_000 }],
                },
            }),
        );

        const result = await player();

        expect(result).toMatchObject({ ok: true });
        expect(result.ok && result.achievements[0].apiname).toBe("ACH_WIN");
    });

    it.each([
        ["no stats (HTTP 400)", 400, "Requested app has no stats", "no-stats"],
        ["private profile (HTTP 403)", 403, "Profile is not public", "profile-private"],
    ])("models %s as a value, not an error", async (_label, status, error, reason) => {
        fetchMock.mockResolvedValue(jsonResponse({ playerstats: { error } }, status));

        // Expected per-app conditions must not be counted as job failures, and a
        // private-profile 403 must not be mistaken for rate limiting.
        expect(await player()).toEqual({ ok: false, reason });
        expect(reportRateLimit).not.toHaveBeenCalled();
    });

    it("treats success:false without a recognised message as no-stats", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ playerstats: { success: false } }));

        expect(await player()).toEqual({ ok: false, reason: "no-stats" });
    });

    it.each([
        ["empty object", {}],
        ["null playerstats", { playerstats: null }],
        ["achievements not an array", { playerstats: { achievements: "none" } }],
    ])("returns an empty unlock list for %s", async (_label, payload) => {
        fetchMock.mockResolvedValue(jsonResponse(payload));

        expect(await player()).toEqual({ ok: true, achievements: [] });
    });

    it("drops malformed unlock entries and keeps the rest", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                playerstats: {
                    achievements: [
                        { apiname: "ACH_A", achieved: 1, unlocktime: 1 },
                        { achieved: 1 },
                        { apiname: "ACH_B" },
                    ],
                },
            }),
        );

        const result = await player();

        expect(result.ok && result.achievements.map((a) => a.apiname)).toEqual(["ACH_A", "ACH_B"]);
        // Missing unlocktime defaults rather than discarding the unlock.
        expect(result.ok && result.achievements[1].unlocktime).toBe(0);
    });

    it("reports an HTML maintenance page served with HTTP 200 as a Steam error", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(textResponse(HTML_MAINTENANCE_PAGE, 200)));

        // Previously a bare SyntaxError from response.json().
        await expect(player()).rejects.toThrow(/non-JSON response from ISteamUserStats\/GetPlayerAchievements/);
    });

    it("raises SteamRateLimitError on 429", async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, 429));

        await expect(player()).rejects.toThrow(/rate-limited/);
        expect(reportRateLimit).toHaveBeenCalled();
    });
});
