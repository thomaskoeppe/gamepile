import type {SteamTag, TagListResponse} from "@/src/lib/steam/api/types.js";
import {getWorkerEnv} from "@/src/lib/env.js";
import {logger} from "@/src/lib/logger.js";
import {steamRateLimiter, SteamRateLimitError} from "@/src/lib/steam/ratelimiter.js";

const log = logger.child("worker.lib.steam:tagCache");

/** TTL for the in-memory tag cache (24 hours). */
const TAG_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

/** In-memory map of tagId → tag name, populated lazily from the Steam API. */
let tagCache: Map<number, string> | null = null;
/** Timestamp (ms) when the tag cache was last populated. */
let tagCacheLoadedAt = 0;

/**
 * Loads the Steam tag list from the IStoreService/GetTagList API and caches it in memory.
 *
 * Returns the cached map if it was populated within the last {@link TAG_CACHE_TTL_MS}.
 * Otherwise, fetches a fresh copy from Steam (respecting the rate limiter).
 *
 * @returns A `Map` of tagId → tag name.
 * @throws {SteamRateLimitError} If Steam responds with HTTP 429 or 403.
 * @throws {Error} If the HTTP request fails for any other reason.
 */
async function loadTagCache(): Promise<Map<number, string>> {
    const now = Date.now();
    if (tagCache && now - tagCacheLoadedAt < TAG_CACHE_TTL_MS) {
        return tagCache;
    }

    await steamRateLimiter.acquire();

    const apiKey = getWorkerEnv().STEAM_API_KEY;
    const url = `https://api.steampowered.com/IStoreService/GetTagList/v1?key=${apiKey}&language=english`;

    log.debug("Loading Steam tag list");

    const response = await fetch(url, {headers: {Accept: "application/json"}});

    if (response.status === 429 || response.status === 403) {
        steamRateLimiter.reportRateLimit();
        throw new SteamRateLimitError(0, response.status);
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch Steam tag list: HTTP ${response.status}`);
    }

    const data = (await response.json()) as TagListResponse;
    const tags = data.response.tags ?? [];

    tagCache = new Map(tags.map((t) => [t.tagid, t.name]));
    tagCacheLoadedAt = now;

    log.debug("Steam tag list loaded", {tagCount: tagCache.size});

    return tagCache;
}

/**
 * Returns all Steam tags as an array of `{ tagid, name }` objects.
 *
 * Populates or refreshes the in-memory cache if needed.
 *
 * @returns Array of all known Steam tags.
 * @throws {SteamRateLimitError} If the cache is cold and Steam rate-limits the request.
 */
export async function getAllTags(): Promise<SteamTag[]> {
    const cache = await loadTagCache();
    return Array.from(cache.entries()).map(([tagid, name]) => ({tagid, name}));
}

/**
 * Resolves an array of numeric tag IDs to their human-readable names.
 *
 * Unknown tag IDs (not present in the cache) are silently omitted from the result.
 *
 * @param tagIds - Array of Steam tag IDs to resolve.
 * @returns Array of resolved tag names (order not guaranteed to match input).
 * @throws {SteamRateLimitError} If the cache is cold and Steam rate-limits the request.
 */
export async function resolveTagNames(tagIds: number[]): Promise<string[]> {
    if (tagIds.length === 0) return [];

    const cache = await loadTagCache();
    return tagIds
        .map((id) => cache.get(id))
        .filter((name): name is string => name !== undefined);
}
