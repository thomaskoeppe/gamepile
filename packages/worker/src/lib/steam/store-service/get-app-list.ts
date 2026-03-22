import {logger} from "@/src/lib/logger.js";
import {steamRateLimiter} from "@/src/lib/steam/ratelimiter.js";

const log = logger.child("steam.get-app-list");

export type SteamApp = {
    appid: number;
    name: string;
    last_modified: number;
    price_change_number: number;
};

export type GetAppListOptions = {
    key: string;
    includeGames: boolean;
    includeDlc: boolean;
    maxResults: number;
    lastAppId?: number;
    ignoreLastModified?: boolean;
    ifModifiedSince?: number;
}

export type GetAppListResponse = {
    apps: SteamApp[];
    haveMoreResults: boolean;
    lastAppId: number;
}

const URL = "https://api.steampowered.com/IStoreService/GetAppList/v1";

/**
 * Fetches a list of Steam apps with basic information from the Steam API with pagination support.
 * @param {GetAppListOptions} opts - Options for fetching the app list.
 * @param {string} opts.key - Steam Web API Key.
 * @param {boolean} opts.includeGames - Include games in the response.
 * @param {boolean} opts.includeDlc - Include DLC entries.
 * @param {number} opts.maxResults - Maximum number of results to return.
 * @param {number} [opts.lastAppId] - Pagination cursor. Start fetching after this app ID.
 * @param {boolean} [opts.ignoreLastModified] - Ignore the last modified timestamp.
 * @param {number} [opts.ifModifiedSince] - Only return results modified since this UNIX timestamp.
 * @returns {Promise<GetAppListResponse>} Object containing apps, pagination info, and result status.
 * @throws {Error} If the API request fails or returns a non-OK status.
 */
export async function getAppList(opts: GetAppListOptions): Promise<GetAppListResponse> {
    await steamRateLimiter.acquire();

    const params = new URLSearchParams({
        key: opts.key,
        include_games: opts.includeGames.toString(),
        include_dlc: opts.includeDlc.toString(),
        max_results: opts.maxResults.toString(),
        last_appid: (opts.lastAppId ?? 0).toString(),
        ...(opts.ifModifiedSince && !opts.ignoreLastModified ? { if_modified_since: opts.ifModifiedSince.toString() } : {}),
    });

    log.info(`Fetching app list from Steam API with cursor: ${opts.lastAppId}`, {
        params: params,
    });

    const response = await fetch(
        `${URL}?${params}`,
        { headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch app list for cursor: ${opts.lastAppId}: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
        response: {
            apps: SteamApp[];
            have_more_results?: boolean;
            last_appid?: number;
        };
    };

    log.info(`Received response from Steam API for cursor: ${opts.lastAppId}. Total apps in this batch: ${data.response.apps.length}`, {
        have_more_results: data.response.have_more_results,
        last_appid: data.response.last_appid,
        apps: (data.response.apps ?? []).length
    });

    return {
        apps: data.response.apps ?? [],
        haveMoreResults: data.response.have_more_results ?? false,
        lastAppId: data.response.last_appid ?? 0,
    }
}