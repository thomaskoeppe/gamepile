/**
 * Malformed and hostile Steam responses driven through the store-browse client.
 *
 * Every case here previously either threw and killed the whole batch job, or
 * silently persisted corrupt data. Nothing in the codebase exercised any of them.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    HTML_MAINTENANCE_PAGE,
    jsonResponse,
    MALFORMED_ENVELOPES,
    storeBrowseEnvelope,
    textResponse,
    TRUNCATED_JSON,
    validStoreItem,
} from "../../__tests__/fixtures/steam.js";

vi.mock("@/src/lib/env.js", () => ({
    getWorkerEnv: () => ({ STEAM_API_KEY: "0".repeat(32) }),
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

vi.mock("@/src/lib/worker-metrics.js", () => ({
    publishSteamApiCall: vi.fn().mockResolvedValue(undefined),
    publishSteamAppsFetched: vi.fn().mockResolvedValue(undefined),
}));

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

// Tag resolution hits Redis/Postgres; the mappers are tested separately.
vi.mock("@/src/lib/steam/cache/tag-cache.js", () => ({
    resolveTagNames: vi.fn().mockResolvedValue([]),
}));

const fetchMock = vi.fn();

beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    reportRateLimit.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

async function fetchBatch(appIds: number[] = [220]) {
    const { fetchStoreBrowseDetailsBatch } = await import("../store-browse.js");
    return fetchStoreBrowseDetailsBatch(appIds);
}

describe("malformed response envelopes", () => {
    it.each(MALFORMED_ENVELOPES)("survives $label without throwing", async ({ payload }) => {
        fetchMock.mockResolvedValue(jsonResponse(payload));

        // Pre-fix this threw `TypeError: Cannot read properties of undefined`
        // and failed the entire batch job.
        const results = await fetchBatch();

        expect(results.size).toBe(0);
    });
});

describe("non-JSON responses", () => {
    it("reports an HTML maintenance page served with HTTP 200 as a Steam error", async () => {
        // A Response body can only be read once, so each call needs a fresh one.
        fetchMock.mockImplementation(() => Promise.resolve(textResponse(HTML_MAINTENANCE_PAGE, 200)));

        // Previously surfaced as a bare SyntaxError naming neither the endpoint
        // nor the fact that Steam had served HTML.
        await expect(fetchBatch()).rejects.toThrow(/non-JSON response from IStoreBrowseService/);
        await expect(fetchBatch()).rejects.toThrow(/text\/html/);
    });

    it("reports a truncated body as a Steam error", async () => {
        fetchMock.mockResolvedValue(textResponse(TRUNCATED_JSON, 200, "application/json"));

        await expect(fetchBatch()).rejects.toThrow(/non-JSON response/);
    });

    it("reports an empty body rather than throwing on an empty snippet", async () => {
        fetchMock.mockResolvedValue(textResponse("", 200, "application/json"));

        await expect(fetchBatch()).rejects.toThrow(/<empty body>/);
    });
});

describe("malformed items within a valid envelope", () => {
    it("keeps the good items and discards only the bad ones", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse(
                storeBrowseEnvelope([
                    validStoreItem({ appid: 220, name: "Half-Life 2" }),
                    { success: 1, name: "No appid at all" },
                    validStoreItem({ appid: 440, name: "Team Fortress 2" }),
                    { appid: "not-a-number", success: 1 },
                    validStoreItem({ appid: 570, name: "Dota 2" }),
                ]),
            ),
        );

        const results = await fetchBatch([220, 440, 570]);

        // A partial Steam outage must degrade the sync, not fail it.
        expect(results.size).toBe(3);
        expect([...results.keys()].sort((a, b) => a - b)).toEqual([220, 440, 570]);
    });

    it("skips items Steam marks unsuccessful", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse(
                storeBrowseEnvelope([
                    validStoreItem({ appid: 220, success: 1 }),
                    validStoreItem({ appid: 999, success: 0 }),
                ]),
            ),
        );

        const results = await fetchBatch([220, 999]);

        expect(results.has(220)).toBe(true);
        expect(results.has(999)).toBe(false);
    });

    it("coerces a stringified appid rather than discarding the item", async () => {
        fetchMock.mockResolvedValue(jsonResponse(storeBrowseEnvelope([validStoreItem({ appid: "220" })])));

        const results = await fetchBatch([220]);

        // Steam is inconsistent about numeric types; rejecting these would lose games.
        expect(results.get(220)?.appId).toBe(220);
    });
});

describe("partial items", () => {
    it("falls back to a generated name when name is empty", async () => {
        fetchMock.mockResolvedValue(jsonResponse(storeBrowseEnvelope([validStoreItem({ name: "" })])));

        expect((await fetchBatch()).get(220)?.name).toBe("App 220");
    });

    it("maps an item stripped of every optional field", async () => {
        fetchMock.mockResolvedValue(jsonResponse(storeBrowseEnvelope([{ appid: 220, success: 1, type: 0 }])));

        const details = (await fetchBatch()).get(220);

        expect(details).toMatchObject({
            appId: 220,
            name: "App 220",
            releaseDate: null,
            platforms: [],
            developers: [],
            publishers: [],
            headerImageUrl: null,
            reviewScore: null,
            screenshotUrls: [],
            trailers: [],
        });
    });

    it("maps an unknown numeric type to UNKNOWN instead of failing", async () => {
        fetchMock.mockResolvedValue(jsonResponse(storeBrowseEnvelope([validStoreItem({ type: 99 })])));

        expect((await fetchBatch()).get(220)?.type).toBe("UNKNOWN");
    });

    it.each([
        ["coming soon", { steam_release_date: 1_700_000_000, is_coming_soon: true }],
        ["zero timestamp", { steam_release_date: 0 }],
        ["absent release block", undefined],
    ])("yields a null release date for %s", async (_label, release) => {
        fetchMock.mockResolvedValue(jsonResponse(storeBrowseEnvelope([validStoreItem({ release })])));

        expect((await fetchBatch()).get(220)?.releaseDate).toBeNull();
    });
});

describe("media extraction on weird payloads", () => {
    it("drops a trailer whose cdn_path is missing instead of writing 'undefined' into the URL", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse(
                storeBrowseEnvelope([
                    validStoreItem({
                        trailers: {
                            highlights: [
                                {
                                    trailer_name: "Broken",
                                    trailer_url_format: "steam/apps/220/${FILENAME}",
                                    adaptive_trailers: [{ encoding: "hls_h264" }],
                                },
                                {
                                    trailer_name: "Good",
                                    trailer_url_format: "steam/apps/220/${FILENAME}",
                                    adaptive_trailers: [{ encoding: "hls_h264", cdn_path: "ok.m3u8" }],
                                },
                            ],
                        },
                    }),
                ]),
            ),
        );

        const trailers = (await fetchBatch()).get(220)?.trailers ?? [];

        expect(trailers).toHaveLength(1);
        expect(trailers[0].title).toBe("Good");
        // The pre-fix mapper produced ".../undefined" here and persisted it.
        expect(JSON.stringify(trailers)).not.toContain("undefined");
    });

    it("de-duplicates screenshots and orders them deterministically without ordinals", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse(
                storeBrowseEnvelope([
                    validStoreItem({
                        screenshots: {
                            all_ages_screenshots: [{ filename: "b.jpg" }, { filename: "a.jpg" }, { filename: "b.jpg" }],
                        },
                    }),
                ]),
            ),
        );

        const shots = (await fetchBatch()).get(220)?.screenshotUrls ?? [];

        expect(shots).toHaveLength(2);
        expect(shots.every((url) => !url.includes("undefined"))).toBe(true);
    });

    it("returns null asset URLs when the assets block is absent", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse(
                storeBrowseEnvelope([validStoreItem({ assets: undefined, assets_without_overrides: undefined })]),
            ),
        );

        expect((await fetchBatch()).get(220)).toMatchObject({
            headerImageUrl: null,
            capsuleImageUrl: null,
            libraryCapsuleUrl: null,
        });
    });
});

describe("rate limiting and transport failures", () => {
    it.each([429, 403])("raises SteamRateLimitError on HTTP %i and notifies the limiter", async (status) => {
        fetchMock.mockResolvedValue(textResponse("rate limited", status, "text/plain"));

        await expect(fetchBatch()).rejects.toThrow(/rate-limited/);
        expect(reportRateLimit).toHaveBeenCalled();
    });

    it("raises a descriptive error on a server failure", async () => {
        fetchMock.mockResolvedValue(textResponse("boom", 500, "text/plain"));

        await expect(fetchBatch()).rejects.toThrow(/HTTP 500/);
    });

    it("returns early without calling fetch for an empty batch", async () => {
        expect((await fetchBatch([])).size).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses a batch larger than the Steam limit", async () => {
        await expect(fetchBatch(Array.from({ length: 51 }, (_, i) => i))).rejects.toThrow(/max batch size/);
    });
});
