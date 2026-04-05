import { logger } from "@/src/lib/logger.js";
import { steamRateLimiter } from "@/src/lib/steam/ratelimiter.js";

const log = logger.child("worker.lib.steam:getAppList");

/**
 * Represents a single application entry returned by the Steam IStoreService/GetAppList API.
 */
export type SteamApp = {
    /** Steam application ID. */
    appid: number;
    /** Display name of the application. */
    name: string;
    /** Unix timestamp of the last modification. */
    last_modified: number;
    /** Numeric price change counter. */
    price_change_number: number;
};

/**
 * Options for configuring a {@link getAppList} request.
 */
export type GetAppListOptions = {
    /** Steam Web API key. */
    key: string;
    /** Whether to include games in the results. */
    includeGames: boolean;
    /** Whether to include DLC in the results. */
    includeDlc: boolean;
    /** Maximum number of results per page. */
    maxResults: number;
    /** Cursor — last appId from the previous page (0 for first page). */
    lastAppId?: number;
    /** When `true`, the `ifModifiedSince` parameter is ignored. */
    ignoreLastModified?: boolean;
    /** Unix timestamp — only return apps modified after this time. */
    ifModifiedSince?: number;
};

/**
 * Parsed response from a single page of the Steam IStoreService/GetAppList API.
 */
export type GetAppListResponse = {
    /** Array of applications returned in this page. */
    apps: SteamApp[];
    /** Whether additional pages are available. */
    haveMoreResults: boolean;
    /** The last appId in this page — use as cursor for the next request. */
    lastAppId: number;
};

/** Base URL for the Steam IStoreService/GetAppList v1 endpoint. */
const STORE_SERVICE_URL = "https://api.steampowered.com/IStoreService/GetAppList/v1";

/**
 * Fetches a single page of the Steam application catalog from the IStoreService/GetAppList API.
 *
 * Automatically respects the global Steam rate limiter before making the HTTP request.
 * Supports cursor-based pagination via `opts.lastAppId` and incremental updates via
 * `opts.ifModifiedSince`.
 *
 * @param opts - Configuration options for the API request.
 * @returns A page of Steam apps with pagination metadata.
 * @throws {Error} If the HTTP response status indicates a failure.
 */
export async function getAppList(opts: GetAppListOptions): Promise<GetAppListResponse> {
    await steamRateLimiter.acquire();

    const params = new URLSearchParams({
        key: opts.key,
        include_games: opts.includeGames.toString(),
        include_dlc: opts.includeDlc.toString(),
        max_results: opts.maxResults.toString(),
        last_appid: (opts.lastAppId ?? 0).toString(),
        ...(opts.ifModifiedSince && !opts.ignoreLastModified
            ? { if_modified_since: opts.ifModifiedSince.toString() }
            : {}),
    });

    log.debug("Fetching app list page from Steam API", {
        cursor: opts.lastAppId ?? 0,
    });

    const response = await fetch(
        `${STORE_SERVICE_URL}?${params}`,
        { headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
        throw new Error(
            `Failed to fetch app list (cursor=${opts.lastAppId}): ${response.status} ${response.statusText}`,
        );
    }

    const data = (await response.json()) as {
        response: {
            apps: SteamApp[];
            have_more_results?: boolean;
            last_appid?: number;
        };
    };

    const apps = data.response.apps ?? [];

    log.debug("Received Steam API app list page", {
        cursor: opts.lastAppId ?? 0,
        batchSize: apps.length,
        haveMoreResults: data.response.have_more_results ?? false,
    });

    return {
        apps,
        haveMoreResults: data.response.have_more_results ?? false,
        lastAppId: data.response.last_appid ?? 0,
    };
}
