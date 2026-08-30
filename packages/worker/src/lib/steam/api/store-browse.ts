import type { StoreBrowseDetails, StoreBrowseItem } from "@/src/lib/steam/api/types.js";
import { resolveTagNames } from "@/src/lib/steam/cache/tag-cache.js";
import {
    extractAssetUrls,
    extractReviews,
    extractScreenshots,
    extractTrailers,
    mapBrowsePlatforms,
    mapBrowseTypeToGameType,
    parseReleaseTimestamp,
} from "@/src/lib/steam/mappers.js";
import { fetchSteamJson } from "@/src/lib/steam/api/fetch-json.js";
import { extractEnvelopeArray, parseItems, storeBrowseItemSchema } from "@/src/lib/steam/api/schemas.js";
import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";
import { publishSteamApiCall, publishSteamAppsFetched } from "@/src/lib/worker-metrics.js";

const log = logger.child("worker.lib.steam:storeBrowse");

/** Base URL for the Steam IStoreBrowseService/GetItems v1 endpoint. */
const STORE_BROWSE_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1";

/** Maximum number of appIds that can be requested in a single batch. */
export const STORE_BROWSE_BATCH_SIZE = 50;

/**
 * Maps a raw {@link StoreBrowseItem} from the Steam API into a normalized
 * {@link StoreBrowseDetails} object suitable for database persistence.
 *
 * Resolves tag names from the in-memory tag cache and aggregates category IDs
 * from all category groups.
 *
 * @param item - Raw store browse item from the Steam API.
 * @returns Normalised game details.
 */
async function mapItemToDetails(item: StoreBrowseItem): Promise<StoreBrowseDetails> {
    const tagIds = item.tags?.map((t) => t.tagid) ?? item.tagids ?? [];
    const tagNames = await resolveTagNames(tagIds);

    const categoryIds = [
        ...new Set([
            ...(item.categories?.supported_player_categoryids ?? []),
            ...(item.categories?.feature_categoryids ?? []),
            ...(item.categories?.controller_categoryids ?? []),
        ]),
    ];

    const isEarlyAccess = item.is_early_access ?? item.release?.is_early_access ?? false;

    return {
        appId: item.appid,
        name: item.name || `App ${item.appid}`,
        type: mapBrowseTypeToGameType(item.type),
        isFree: item.is_free ?? false,
        isEarlyAccess,
        shortDescription: item.basic_info?.short_description || null,
        fullDescription: item.full_description_bbcode || null,
        developers: (item.basic_info?.developers ?? []).map((d) => d.name),
        publishers: (item.basic_info?.publishers ?? []).map((p) => p.name),
        franchises: (item.basic_info?.franchises ?? []).map((f) => f.name),
        releaseDate: parseReleaseTimestamp(item.release),
        platforms: mapBrowsePlatforms(item.platforms),
        tagIds,
        tagNames,
        categoryIds,
        ...extractReviews(item),
        ...extractAssetUrls(item),
        steamDeckCompat: item.platforms?.steam_deck_compat_category ?? null,
        detailsFetchedAt: new Date(),
        screenshotUrls: extractScreenshots(item),
        trailers: extractTrailers(item),
    };
}

/**
 * Fetches detailed store metadata for a single Steam app.
 *
 * Convenience wrapper around {@link fetchStoreBrowseDetailsBatch} for single-app lookups.
 *
 * @param appId - The Steam application ID to look up.
 * @returns Normalised game details, or `null` if the item was not found or unsuccessful.
 */
export async function fetchStoreBrowseDetails(appId: number): Promise<StoreBrowseDetails | null> {
    const results = await fetchStoreBrowseDetailsBatch([appId]);
    return results.get(appId) ?? null;
}

/**
 * Fetches detailed store metadata for a batch of Steam apps in a single API call.
 *
 * Requests basic info, release dates, platforms, tags, categories, reviews, assets,
 * and full descriptions from the IStoreBrowseService/GetItems endpoint.
 *
 * Automatically respects the global Steam rate limiter. Only items with `success === 1`
 * are included in the returned map.
 *
 * @param appIds - Array of Steam application IDs to fetch (max {@link STORE_BROWSE_BATCH_SIZE}).
 * @returns A `Map` from appId to normalized {@link StoreBrowseDetails}.
 * @throws {SteamRateLimitError} If Steam responds with HTTP 429 or 403.
 * @throws {Error} If the batch size exceeds the maximum or the HTTP request fails.
 */
export async function fetchStoreBrowseDetailsBatch(appIds: number[]): Promise<Map<number, StoreBrowseDetails>> {
    if (appIds.length === 0) return new Map();

    if (appIds.length > STORE_BROWSE_BATCH_SIZE) {
        throw new Error(
            `fetchStoreBrowseDetailsBatch: received ${appIds.length} appIds, ` +
                `but max batch size is ${STORE_BROWSE_BATCH_SIZE}`,
        );
    }

    const apiKey = getWorkerEnv().STEAM_API_KEY;

    const inputJson = JSON.stringify({
        ids: appIds.map((appid) => ({ appid })),
        data_request: {
            include_basic_info: true,
            include_release: true,
            include_platforms: true,
            include_tag_count: 20,
            include_categories: true,
            include_reviews: true,
            include_assets: true,
            include_assets_without_overrides: true,
            include_full_description: true,
            include_screenshots: true,
            include_trailers: true,
        },
        context: {
            language: "english",
            country_code: "US",
        },
    });

    const url = `${STORE_BROWSE_URL}?key=${apiKey}&input_json=${encodeURIComponent(inputJson)}`;

    const payload = await fetchSteamJson(url, {
        endpoint: "IStoreBrowseService/GetItems",
        appId: appIds[0],
    }).finally(() => {
        void publishSteamApiCall();
        void publishSteamAppsFetched(appIds.length);
    });

    // Tolerates `{}`, `{"response": null}` and a non-array `store_items`, all of
    // which Steam returns under load and all of which used to throw a TypeError
    // here and kill the entire batch.
    const rawItems = extractEnvelopeArray(payload, "response", "store_items");
    const { valid, invalid } = parseItems(rawItems, storeBrowseItemSchema);

    if (invalid.length > 0) {
        log.warn("Discarded malformed store items", {
            requested: appIds.length,
            returned: rawItems.length,
            discarded: invalid.length,
            reasons: invalid.slice(0, 5).map((entry) => entry.reason),
        });
    }

    const results = new Map<number, StoreBrowseDetails>();

    for (const item of valid) {
        if (item.success !== 1) continue;
        const details = await mapItemToDetails(item as unknown as StoreBrowseItem);
        results.set(item.appid, details);
    }

    log.debug("Batch fetch completed", {
        requested: appIds.length,
        returned: rawItems.length,
        successful: results.size,
        discarded: invalid.length,
    });

    return results;
}
