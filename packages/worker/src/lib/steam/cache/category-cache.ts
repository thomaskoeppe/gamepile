import type { SteamCategory, StoreCategoriesResponse } from "@/src/lib/steam/api/types.js";
import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";
import { steamRateLimiter, SteamRateLimitError } from "@/src/lib/steam/ratelimiter.js";

const log = logger.child("worker.lib.steam:categoryCache");

/** TTL for the in-memory category cache (24 hours). */
const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

/** In-memory map of categoryId → full {@link SteamCategory} object. */
let categoryCache: Map<number, SteamCategory> | null = null;
/** Timestamp (ms) when the category cache was last populated. */
let categoryCacheLoadedAt = 0;

/**
 * Loads the Steam store categories from the IStoreBrowseService/GetStoreCategories API
 * and caches them in memory.
 *
 * Returns the cached map if it was populated within the last {@link CATEGORY_CACHE_TTL_MS}.
 * Otherwise, fetches a fresh copy from Steam (respecting the rate limiter).
 *
 * @returns A `Map` of categoryId → {@link SteamCategory}.
 * @throws {SteamRateLimitError} If Steam responds with HTTP 429 or 403.
 * @throws {Error} If the HTTP request fails for any other reason.
 */
async function loadCategoryCache(): Promise<Map<number, SteamCategory>> {
    const now = Date.now();
    if (categoryCache && now - categoryCacheLoadedAt < CATEGORY_CACHE_TTL_MS) {
        return categoryCache;
    }

    await steamRateLimiter.acquire();

    const apiKey = getWorkerEnv().STEAM_API_KEY;
    const url = `https://api.steampowered.com/IStoreBrowseService/GetStoreCategories/v1?key=${apiKey}&language=english`;

    log.debug("Loading Steam store categories");

    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (response.status === 429 || response.status === 403) {
        steamRateLimiter.reportRateLimit();
        throw new SteamRateLimitError(0, response.status);
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch Steam store categories: HTTP ${response.status}`);
    }

    const data = (await response.json()) as StoreCategoriesResponse;
    const categories = data.response.categories ?? [];

    categoryCache = new Map(categories.map((c) => [c.categoryid, c]));
    categoryCacheLoadedAt = now;

    log.debug("Steam store categories loaded", { categoryCount: categoryCache.size });

    return categoryCache;
}

/**
 * Returns all Steam store categories as an array.
 *
 * Populates or refreshes the in-memory cache if needed.
 *
 * @returns Array of all known Steam store categories.
 * @throws {SteamRateLimitError} If the cache is cold and Steam rate-limits the request.
 */
export async function getAllCategories(): Promise<SteamCategory[]> {
    const cache = await loadCategoryCache();
    return Array.from(cache.values());
}
