/**
 * The tag and category caches sit on the same fragile envelope pattern the other
 * Steam clients did: `data.response.tags` dereferenced unguarded.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    HTML_MAINTENANCE_PAGE,
    jsonResponse,
    MALFORMED_ENVELOPES,
    textResponse,
} from "../../__tests__/fixtures/steam.js";

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
        steamRateLimiter: { acquire: vi.fn().mockResolvedValue(undefined), reportRateLimit },
    };
});

const fetchMock = vi.fn();

beforeEach(() => {
    // Both caches memoise on module state, so each test needs a fresh module.
    vi.resetModules();
    fetchMock.mockReset();
    reportRateLimit.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

describe("tag cache", () => {
    async function tags() {
        const { getAllTags } = await import("../tag-cache.js");
        return getAllTags();
    }

    async function resolve(ids: number[]) {
        const { resolveTagNames } = await import("../tag-cache.js");
        return resolveTagNames(ids);
    }

    it("loads and exposes the tag list", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                response: {
                    tags: [
                        { tagid: 1, name: "Action" },
                        { tagid: 2, name: "Indie" },
                    ],
                },
            }),
        );

        expect(await tags()).toEqual([
            { tagid: 1, name: "Action" },
            { tagid: 2, name: "Indie" },
        ]);
    });

    it.each(MALFORMED_ENVELOPES)("returns an empty list for $label", async ({ payload }) => {
        fetchMock.mockResolvedValue(jsonResponse(payload));

        // Pre-fix: TypeError on `data.response.tags`, failing every sync that
        // needed to resolve a tag name.
        expect(await tags()).toEqual([]);
    });

    it("drops malformed tag entries and keeps the rest", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                response: { tags: [{ tagid: 1, name: "Action" }, { name: "no id" }, { tagid: 3 }, null] },
            }),
        );

        expect(await tags()).toEqual([{ tagid: 1, name: "Action" }]);
    });

    it("resolves known ids and omits unknown ones", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ response: { tags: [{ tagid: 1, name: "Action" }] } }));

        expect(await resolve([1, 999])).toEqual(["Action"]);
    });

    it("short-circuits an empty id list without hitting Steam", async () => {
        expect(await resolve([])).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("serves later calls from cache rather than re-fetching", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ response: { tags: [{ tagid: 1, name: "Action" }] } }));

        const { getAllTags, resolveTagNames } = await import("../tag-cache.js");
        await getAllTags();
        await resolveTagNames([1]);
        await getAllTags();

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("reports an HTML maintenance page as a Steam error", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(textResponse(HTML_MAINTENANCE_PAGE, 200)));

        await expect(tags()).rejects.toThrow(/non-JSON response/);
    });

    it("raises SteamRateLimitError on 429", async () => {
        fetchMock.mockResolvedValue(textResponse("limited", 429, "text/plain"));

        await expect(tags()).rejects.toThrow(/rate-limited/);
        expect(reportRateLimit).toHaveBeenCalled();
    });
});

describe("category cache", () => {
    async function categories() {
        const { getAllCategories } = await import("../category-cache.js");
        return getAllCategories();
    }

    it("loads and exposes the category list", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                response: {
                    categories: [
                        { categoryid: 2, type: 0, internal_name: "single_player", display_name: "Single-player" },
                    ],
                },
            }),
        );

        expect(await categories()).toHaveLength(1);
        expect((await categories())[0]).toMatchObject({ categoryid: 2, display_name: "Single-player" });
    });

    it.each(MALFORMED_ENVELOPES)("returns an empty list for $label", async ({ payload }) => {
        fetchMock.mockResolvedValue(jsonResponse(payload));

        expect(await categories()).toEqual([]);
    });

    it("drops entries with no categoryid", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                response: {
                    categories: [{ categoryid: 2, display_name: "Single-player" }, { display_name: "orphan" }],
                },
            }),
        );

        expect(await categories()).toHaveLength(1);
    });

    it("defaults optional display fields rather than discarding the category", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ response: { categories: [{ categoryid: 9 }] } }));

        expect((await categories())[0]).toMatchObject({ categoryid: 9, internal_name: "", display_name: "" });
    });
});
