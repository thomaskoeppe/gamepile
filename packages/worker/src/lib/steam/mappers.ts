import {GameType} from "@/src/prisma/generated/enums.js";
import type {AssetUrls, ReviewData, StoreBrowseItem} from "@/src/lib/steam/api/types.js";

/** Base URL for the Steam shared asset CDN. */
const ASSET_CDN_BASE = "https://shared.akamai.steamstatic.com/store_item_assets/";

/** Base URL for Steam CDN paths that are already rooted under `steam/`. */
const STEAM_CDN_BASE = "https://shared.akamai.steamstatic.com/";

/**
 * Resolves a Steam asset path to a full CDN URL using the given URL format template.
 *
 * @param assetUrlFormat - The URL format string containing a `${FILENAME}` placeholder.
 * @param assetPath - The asset filename to substitute into the format string.
 * @returns The fully resolved CDN URL.
 */
export function resolveAssetUrl(assetUrlFormat: string, assetPath: string): string {
    return ASSET_CDN_BASE + assetUrlFormat.replace("${FILENAME}", assetPath);
}

/**
 * Resolves either a relative asset filename, a rooted Steam CDN path, or an
 * absolute URL into a fully qualified URL.
 *
 * @param assetPath - Asset path returned by the Steam API.
 * @param assetUrlFormat - Optional asset URL format for relative filenames.
 * @returns A fully resolved URL, or `null` when the input is empty.
 */
export function resolveSteamMediaUrl(assetPath?: string | null, assetUrlFormat?: string): string | null {
    if (!assetPath) return null;

    if (assetPath.startsWith("http://") || assetPath.startsWith("https://")) {
        return assetPath;
    }

    if (assetPath.startsWith("steam/")) {
        return `${STEAM_CDN_BASE}${assetPath}`;
    }

    if (assetUrlFormat) {
        return resolveAssetUrl(assetUrlFormat, assetPath);
    }

    return null;
}

/**
 * Maps a numeric Steam browse type to the internal {@link GameType} enum.
 *
 * @param browseType - The numeric type from the Steam IStoreBrowseService API.
 * @returns The corresponding {@link GameType} enum value.
 */
export function mapBrowseTypeToGameType(browseType: number): GameType {
    switch (browseType) {
        case 0:
            return GameType.GAME;
        case 1:
            return GameType.DLC;
        case 2:
            return GameType.DEMO;
        case 4:
            return GameType.ADVERTISING;
        case 6:
            return GameType.MOD;
        default:
            return GameType.UNKNOWN;
    }
}

/**
 * Extracts supported platform identifiers from a Steam browse item's platform data.
 *
 * @param p - The platforms object from a {@link StoreBrowseItem}, or `undefined`.
 * @returns Array of platform identifiers (`"WINDOWS"`, `"MAC"`, `"LINUX"`).
 */
export function mapBrowsePlatforms(p?: StoreBrowseItem["platforms"]): Array<"WINDOWS" | "MAC" | "LINUX"> {
    const out: Array<"WINDOWS" | "MAC" | "LINUX"> = [];
    if (p?.windows) out.push("WINDOWS");
    if (p?.mac) out.push("MAC");
    if (p?.steamos_linux) out.push("LINUX");
    return out;
}

/**
 * Parses a Steam release timestamp into a `Date` object.
 *
 * Returns `null` if:
 * - No release data is available
 * - The item is marked as "coming soon"
 * - The timestamp is zero or produces an invalid date
 *
 * The resulting date is normalized to midnight UTC.
 *
 * @param release - The release object from a {@link StoreBrowseItem}, or `undefined`.
 * @returns The parsed release date at midnight UTC, or `null`.
 */
export function parseReleaseTimestamp(release?: StoreBrowseItem["release"]): Date | null {
    if (!release) return null;
    if (release.is_coming_soon) return null;

    const ts = release.steam_release_date;
    if (!ts || ts === 0) return null;

    const date = new Date(ts * 1_000);
    if (isNaN(date.getTime())) return null;

    date.setUTCHours(0, 0, 0, 0);
    return date;
}

/**
 * Extracts aggregated review data from a Steam browse item.
 *
 * Uses the `summary_filtered` field (all-language aggregate). Returns null
 * values for all fields if no reviews are available.
 *
 * @param item - A raw {@link StoreBrowseItem} from the Steam API.
 * @returns Extracted {@link ReviewData} with score, percentage, count, and label.
 */
export function extractReviews(item: StoreBrowseItem): ReviewData {
    const summary = item.reviews?.summary_filtered;
    if (!summary || !summary.review_count) {
        return {reviewScore: null, reviewPercentage: null, reviewCount: null, reviewScoreLabel: null};
    }

    return {
        reviewScore: summary.review_score ?? null,
        reviewPercentage: summary.percent_positive ?? null,
        reviewCount: summary.review_count ?? null,
        reviewScoreLabel: summary.review_score_label ?? null,
    };
}

/**
 * Extracts and resolves asset image URLs from a Steam browse item.
 *
 * Combines the item's `asset_url_format` template with individual asset filenames
 * to produce fully qualified CDN URLs via {@link resolveAssetUrl}.
 *
 * @param item - A raw {@link StoreBrowseItem} from the Steam API.
 * @returns Resolved {@link AssetUrls} with header, capsule, library capsule, and hero image URLs.
 */
export function extractAssetUrls(item: StoreBrowseItem): AssetUrls {
    const assets = {
        ...(item.assets_without_overrides ?? {}),
        ...(item.assets ?? {}),
    };
    const hasAssets = Object.keys(assets).length > 0;
    const fmt = item.assets?.asset_url_format ?? item.assets_without_overrides?.asset_url_format;

    if (!hasAssets) {
        return {headerImageUrl: null, capsuleImageUrl: null, libraryCapsuleUrl: null, libraryHeroUrl: null, heroCapsuleUrl: null};
    }

    return {
        headerImageUrl: resolveSteamMediaUrl(assets.header, fmt),
        capsuleImageUrl: resolveSteamMediaUrl(assets.main_capsule, fmt),
        libraryCapsuleUrl: resolveSteamMediaUrl(assets.library_capsule, fmt),
        libraryHeroUrl: resolveSteamMediaUrl(assets.library_hero, fmt),
        heroCapsuleUrl: resolveSteamMediaUrl(assets.hero_capsule, fmt),
    };
}

/**
 * Extracts screenshot CDN URLs from a Steam browse item.
 *
 * Uses the item's `asset_url_format` template to resolve each screenshot filename
 * into a fully qualified CDN URL, ordered by their ordinal position.
 *
 * @param item - A raw {@link StoreBrowseItem} from the Steam API.
 * @returns Array of fully resolved screenshot CDN URLs.
 */
export function extractScreenshots(item: StoreBrowseItem): string[] {
    const screenshots = [
        ...(item.screenshots?.all_ages_screenshots ?? []),
        ...(item.screenshots?.mature_content_screenshots ?? []),
    ];
    const fmt = item.assets?.asset_url_format ?? item.assets_without_overrides?.asset_url_format;

    if (!screenshots?.length) return [];

    return [...new Map(screenshots.map((screenshot) => [screenshot.filename, screenshot])).values()]
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((ss) => resolveSteamMediaUrl(ss.filename, fmt))
        .filter((url): url is string => url !== null);
}

/**
 * Extracts HLS H.264 trailer URLs from a Steam browse item.
 *
 * Only extracts the `hls_h264` encoding from the `adaptive_trailers` array.
 * Processes all highlighted trailers.
 *
 * @param item - A raw {@link StoreBrowseItem} from the Steam API.
 * @returns Array of trailer objects with URL and title.
 */
export function extractTrailers(item: StoreBrowseItem): Array<{
    url: string;
    title: string | null;
}> {
    const trailers = item.trailers;
    if (!trailers) return [];

    const allTrailers = trailers.highlights ?? [];

    const results: Array<{ url: string; title: string | null }> = [];

    for (const trailer of allTrailers) {
        const fmt = trailer.trailer_url_format;
        if (!fmt) continue;

        const hlsEntry = trailer.adaptive_trailers?.find((t) => t.encoding === "hls_h264");
        if (!hlsEntry) continue;

        const hlsUrl = resolveSteamMediaUrl(fmt.replace("${FILENAME}", hlsEntry.cdn_path));
        if (!hlsUrl) continue;

        results.push({
            url: hlsUrl,
            title: trailer.trailer_name ?? null,
        });
    }

    return results;
}
