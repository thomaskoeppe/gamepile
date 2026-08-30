/**
 * The catalog sync paginates through the entire Steam app list. An unguarded
 * `data.response.apps` meant one bad page aborted the whole walk.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    appListEnvelope,
    HTML_MAINTENANCE_PAGE,
    jsonResponse,
    MALFORMED_ENVELOPES,
    textResponse,
    validApp,
} from "../../__tests__/fixtures/steam.js";

// The rate limiter reads validated worker env at module scope, which is not
// available in tests.
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
    const actual = await vi.importActual<typeof import("../../ratelimiter.js")>("../../ratelimiter.js");
    return {
        SteamRateLimitError: actual.SteamRateLimitError,
        steamRateLimiter: {
            acquire: vi.fn().mockResolvedValue(undefined),
            reportRateLimit,
        },
    };
});

const fetchMock = vi.fn();

const BASE_OPTS = { key: "k", includeGames: true, includeDlc: false, maxResults: 100 };

beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    reportRateLimit.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

async function callGetAppList() {
    const { getAppList } = await import("../get-app-list.js");
    return getAppList(BASE_OPTS);
}

describe("malformed envelopes", () => {
    it.each(MALFORMED_ENVELOPES)("returns an empty page for $label", async ({ payload }) => {
        fetchMock.mockResolvedValue(jsonResponse(payload));

        // Pre-fix: TypeError on `data.response.apps`, aborting the catalog sync.
        const page = await callGetAppList();

        expect(page).toEqual({ apps: [], haveMoreResults: false, lastAppId: 0 });
    });
});

describe("well-formed pages", () => {
    it("returns apps with pagination metadata", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse(
                appListEnvelope([validApp(), validApp({ appid: 570, name: "Dota 2" })], {
                    haveMore: true,
                    lastAppId: 570,
                }),
            ),
        );

        const page = await callGetAppList();

        expect(page.apps).toHaveLength(2);
        expect(page.haveMoreResults).toBe(true);
        expect(page.lastAppId).toBe(570);
    });

    it("treats a non-boolean have_more_results as false so pagination cannot loop forever", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ response: { apps: [validApp()], have_more_results: "yes", last_appid: 1 } }),
        );

        expect((await callGetAppList()).haveMoreResults).toBe(false);
    });

    it("falls back to cursor 0 when last_appid is not numeric", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ response: { apps: [validApp()], last_appid: "abc" } }));

        expect((await callGetAppList()).lastAppId).toBe(0);
    });
});

describe("malformed entries", () => {
    it("keeps valid apps and drops entries with no appid", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse(
                appListEnvelope([validApp({ appid: 220 }), { name: "missing appid" }, validApp({ appid: 440 }), null]),
            ),
        );

        const page = await callGetAppList();

        expect(page.apps.map((a) => a.appid).sort((a, b) => a - b)).toEqual([220, 440]);
    });

    it("defaults missing optional fields rather than discarding the app", async () => {
        fetchMock.mockResolvedValue(jsonResponse(appListEnvelope([{ appid: 220 }])));

        expect((await callGetAppList()).apps[0]).toMatchObject({
            appid: 220,
            name: "",
            last_modified: 0,
        });
    });
});

describe("transport failures", () => {
    it("reports an HTML maintenance page as a Steam error", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(textResponse(HTML_MAINTENANCE_PAGE, 200)));

        await expect(callGetAppList()).rejects.toThrow(/non-JSON response from IStoreService/);
    });

    it("raises on a non-OK status", async () => {
        fetchMock.mockResolvedValue(textResponse("nope", 500, "text/plain"));

        await expect(callGetAppList()).rejects.toThrow(/HTTP 500/);
    });

    it("raises SteamRateLimitError on 429", async () => {
        fetchMock.mockResolvedValue(textResponse("slow down", 429, "text/plain"));

        await expect(callGetAppList()).rejects.toThrow(/rate-limited/);
        expect(reportRateLimit).toHaveBeenCalled();
    });
});
