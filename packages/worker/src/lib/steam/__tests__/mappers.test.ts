/**
 * Direct coverage of the Steam response mappers. These run on every synced game,
 * so a mistake here corrupts data silently rather than failing loudly.
 */

import { describe, expect, it } from "vitest";

import type { StoreBrowseItem } from "../api/types.js";
import {
    extractAssetUrls,
    extractReviews,
    extractScreenshots,
    extractTrailers,
    mapBrowsePlatforms,
    mapBrowseTypeToGameType,
    parseReleaseTimestamp,
    resolveAssetUrl,
    resolveSteamMediaUrl,
} from "../mappers.js";

const item = (partial: Partial<StoreBrowseItem>) => partial as StoreBrowseItem;

describe("resolveSteamMediaUrl", () => {
    it.each([null, undefined, ""])("returns null for %s", (input) => {
        expect(resolveSteamMediaUrl(input)).toBeNull();
    });

    it.each(["http://cdn/a.jpg", "https://cdn/a.jpg"])("passes through the absolute URL %s", (url) => {
        expect(resolveSteamMediaUrl(url)).toBe(url);
    });

    it("roots a steam/-prefixed path on the CDN", () => {
        expect(resolveSteamMediaUrl("steam/apps/220/header.jpg")).toBe(
            "https://shared.akamai.steamstatic.com/steam/apps/220/header.jpg",
        );
    });

    it("applies the asset format to a bare filename", () => {
        expect(resolveSteamMediaUrl("header.jpg", "apps/220/${FILENAME}")).toContain("apps/220/header.jpg");
    });

    it("returns null for a bare filename with no format to resolve it against", () => {
        expect(resolveSteamMediaUrl("header.jpg")).toBeNull();
    });
});

describe("resolveAssetUrl", () => {
    it("substitutes the filename placeholder", () => {
        expect(resolveAssetUrl("apps/220/${FILENAME}", "header.jpg")).toBe(
            "https://shared.akamai.steamstatic.com/store_item_assets/apps/220/header.jpg",
        );
    });
});

describe("mapBrowseTypeToGameType", () => {
    it.each([
        [0, "GAME"],
        [1, "DLC"],
        [2, "DEMO"],
        [4, "ADVERTISING"],
        [6, "MOD"],
    ])("maps %i to %s", (input, expected) => {
        expect(mapBrowseTypeToGameType(input)).toBe(expected);
    });

    it.each([3, 5, 99, -1, Number.NaN])("maps the unrecognised value %s to UNKNOWN", (input) => {
        expect(mapBrowseTypeToGameType(input)).toBe("UNKNOWN");
    });
});

describe("mapBrowsePlatforms", () => {
    it("lists every supported platform", () => {
        expect(mapBrowsePlatforms({ windows: true, mac: true, steamos_linux: true })).toEqual([
            "WINDOWS",
            "MAC",
            "LINUX",
        ]);
    });

    it.each([undefined, {}, { windows: false, mac: false, steamos_linux: false }])(
        "returns an empty list for %s",
        (platforms) => {
            expect(mapBrowsePlatforms(platforms)).toEqual([]);
        },
    );
});

describe("parseReleaseTimestamp", () => {
    it("normalises a valid timestamp to midnight UTC", () => {
        const date = parseReleaseTimestamp({ steam_release_date: 1_099_267_200 });

        expect(date?.toISOString()).toBe("2004-11-01T00:00:00.000Z");
    });

    it.each([
        ["no release block", undefined],
        ["coming soon", { steam_release_date: 1_700_000_000, is_coming_soon: true }],
        ["zero timestamp", { steam_release_date: 0 }],
        ["absent timestamp", {}],
    ])("returns null for %s", (_label, release) => {
        expect(parseReleaseTimestamp(release)).toBeNull();
    });

    it("returns null for a timestamp beyond the representable date range", () => {
        // Steam has been observed returning absurd sentinel values.
        expect(parseReleaseTimestamp({ steam_release_date: 8.64e15 })).toBeNull();
    });
});

describe("extractReviews", () => {
    it("extracts the aggregate summary", () => {
        expect(
            extractReviews(
                item({
                    reviews: {
                        summary_filtered: {
                            review_score: 9,
                            percent_positive: 97,
                            review_count: 100,
                            review_score_label: "Very Positive",
                        },
                    },
                }),
            ),
        ).toEqual({
            reviewScore: 9,
            reviewPercentage: 97,
            reviewCount: 100,
            reviewScoreLabel: "Very Positive",
        });
    });

    it.each([
        ["no reviews block", {}],
        ["no summary", { reviews: {} }],
        ["a zero review count", { reviews: { summary_filtered: { review_count: 0 } } }],
    ])("returns all-null review data for %s", (_label, partial) => {
        expect(extractReviews(item(partial))).toEqual({
            reviewScore: null,
            reviewPercentage: null,
            reviewCount: null,
            reviewScoreLabel: null,
        });
    });
});

describe("extractAssetUrls", () => {
    it("resolves every asset against the format", () => {
        const urls = extractAssetUrls(
            item({
                assets: {
                    asset_url_format: "apps/220/${FILENAME}",
                    header: "header.jpg",
                    main_capsule: "capsule.jpg",
                    library_capsule: "library.jpg",
                    library_hero: "hero.jpg",
                    hero_capsule: "hero_capsule.jpg",
                },
            }),
        );

        expect(urls.headerImageUrl).toContain("apps/220/header.jpg");
        expect(urls.libraryHeroUrl).toContain("apps/220/hero.jpg");
    });

    it("prefers overridden assets over the un-overridden set", () => {
        const urls = extractAssetUrls(
            item({
                assets_without_overrides: { asset_url_format: "apps/220/${FILENAME}", header: "old.jpg" },
                assets: { asset_url_format: "apps/220/${FILENAME}", header: "new.jpg" },
            }),
        );

        expect(urls.headerImageUrl).toContain("new.jpg");
    });

    it("returns all-null URLs when no assets are present", () => {
        expect(extractAssetUrls(item({}))).toEqual({
            headerImageUrl: null,
            capsuleImageUrl: null,
            libraryCapsuleUrl: null,
            libraryHeroUrl: null,
            heroCapsuleUrl: null,
        });
    });
});

describe("extractScreenshots", () => {
    const fmt = { asset_url_format: "apps/220/${FILENAME}" };

    it("orders by ordinal and merges both age buckets", () => {
        const shots = extractScreenshots(
            item({
                assets: fmt,
                screenshots: {
                    all_ages_screenshots: [{ filename: "b.jpg", ordinal: 1 }],
                    mature_content_screenshots: [{ filename: "a.jpg", ordinal: 0 }],
                },
            }),
        );

        expect(shots.map((s) => s.split("/").pop())).toEqual(["a.jpg", "b.jpg"]);
    });

    it("de-duplicates by filename", () => {
        const shots = extractScreenshots(
            item({
                assets: fmt,
                screenshots: {
                    all_ages_screenshots: [
                        { filename: "a.jpg", ordinal: 0 },
                        { filename: "a.jpg", ordinal: 1 },
                    ],
                },
            }),
        );

        expect(shots).toHaveLength(1);
    });

    it("sorts deterministically when ordinal is missing", () => {
        const shots = extractScreenshots(
            item({
                assets: fmt,
                screenshots: { all_ages_screenshots: [{ filename: "a.jpg" }, { filename: "b.jpg" }] as never },
            }),
        );

        // A NaN comparator leaves the order implementation-defined.
        expect(shots).toHaveLength(2);
        expect(shots.every((url) => !url.includes("undefined"))).toBe(true);
    });

    it.each([
        ["no screenshots block", {}],
        ["empty buckets", { screenshots: {} }],
    ])("returns an empty list for %s", (_label, partial) => {
        expect(extractScreenshots(item(partial))).toEqual([]);
    });
});

describe("extractTrailers", () => {
    type Trailer = NonNullable<NonNullable<StoreBrowseItem["trailers"]>["highlights"]>[number];

    const base = {
        trailer_name: "Launch",
        trailer_url_format: "steam/apps/220/${FILENAME}",
        adaptive_trailers: [{ encoding: "hls_h264", cdn_path: "t.m3u8" }],
    } as unknown as Trailer;

    it("extracts the HLS encoding", () => {
        const trailers = extractTrailers(item({ trailers: { highlights: [base] } }));

        expect(trailers).toEqual([
            { url: "https://shared.akamai.steamstatic.com/steam/apps/220/t.m3u8", title: "Launch" },
        ]);
    });

    it("ignores non-HLS encodings", () => {
        const trailers = extractTrailers(
            item({
                trailers: {
                    highlights: [
                        {
                            ...base,
                            adaptive_trailers: [{ encoding: "webm", cdn_path: "t.webm" }],
                        } as unknown as Trailer,
                    ],
                },
            }),
        );

        expect(trailers).toEqual([]);
    });

    it("skips a trailer whose cdn_path is missing rather than emitting 'undefined'", () => {
        const trailers = extractTrailers(
            item({
                trailers: {
                    highlights: [{ ...base, adaptive_trailers: [{ encoding: "hls_h264" }] } as unknown as Trailer],
                },
            }),
        );

        expect(trailers).toEqual([]);
    });

    it("skips a trailer with no url format", () => {
        const trailers = extractTrailers(
            item({
                trailers: { highlights: [{ ...base, trailer_url_format: undefined } as unknown as Trailer] },
            }),
        );

        expect(trailers).toEqual([]);
    });

    it("nulls a missing title rather than dropping the trailer", () => {
        const trailers = extractTrailers(
            item({
                trailers: { highlights: [{ ...base, trailer_name: undefined } as unknown as Trailer] },
            }),
        );

        expect(trailers[0].title).toBeNull();
    });

    it.each([
        ["no trailers block", {}],
        ["no highlights", { trailers: {} }],
    ])("returns an empty list for %s", (_label, partial) => {
        expect(extractTrailers(item(partial))).toEqual([]);
    });
});
