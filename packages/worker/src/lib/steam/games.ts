import {steamRateLimiter, SteamRateLimitError} from "@/src/lib/steam/ratelimiter.js";
import { getWorkerEnv } from "@/src/lib/env.js";
import { parseDate } from "chrono-node";

export type SteamOwnedGame = {
    appid: number;
    name?: string;
    playtime_forever?: number;
    playtime_2weeks?: number;
    rtime_last_played?: number;
};

export type SteamAppDetails = {
    type: "game" | "dlc" | "demo" | "mod" | "advertising" | string;
    name: string;
    steam_appid: number;
    required_age: string;
    is_free: boolean;
    dlc?: number[];
    detailed_description: string;
    about_the_game: string;
    short_description: string;
    supported_languages: string;
    header_image: string;
    capsule_image: string;
    capsule_imagev5: string;
    website: string;
    pc_requirements: {
        minimum: string;
        recommended: string;
    };
    mac_requirements: {
        minimum: string;
        recommended: string;
    };
    linux_requirements: {
        minimum: string;
        recommended: string;
    };
    developers: string[];
    publishers: string[];
    price_overview?: {
        currency: string;
        initial: number;
        final: number;
        discount_percent: number;
        initial_formatted: string;
        final_formatted: string;
    };
    packages: number[];
    package_groups: unknown[];
    platforms: {
        windows: boolean;
        mac: boolean;
        linux: boolean;
    };
    metacritic?: {
        score: number;
        url: string;
    };
    categories: {
        id: number;
        description: string;
    }[];
    genres: {
        id: string;
        description: string;
    }[];
    screenshots: {
        id: number;
        path_thumbnail: string;
        path_full: string;
    }[];
    movies: {
        id: number;
        name: string;
        thumbnail: string;
        webm: {
            '480': string;
            'max': string;
        };
        mp4: {
            '480': string;
            'max': string;
        };
        dash_av1: string;
        dash_h264: string;
        hls_h264: string;
        highlight: boolean;
    }[];
    recommendations: {
        total: number;
    };
    achievements?: {
        total: number;
        highlighted: {
            name: string;
            path: string;
        }[];
    };
    release_date: {
        coming_soon: boolean;
        date: string;
    };
    support_info: {
        url: string;
        email: string;
    };
    background: string;
    background_raw: string;
    content_descriptors: {
        ids: number[];
        notes: string;
    };
    ratings?: {
        [key: string]: {
            [key: string]: string;
        }
    }
}

/**
 * Converts a Steam platform availability object into the `Platform[]` enum format
 * used by the database schema.
 *
 * @param p - The `platforms` field from a Steam app-details API response.
 * @returns Array of platform strings: any combination of `"WINDOWS"`, `"MAC"`, `"LINUX"`.
 */
export function mapPlatforms(p?: SteamAppDetails["platforms"]): Array<"WINDOWS" | "MAC" | "LINUX"> {
    const out: Array<"WINDOWS" | "MAC" | "LINUX"> = [];
    if (p?.windows) out.push("WINDOWS");
    if (p?.mac) out.push("MAC");
    if (p?.linux) out.push("LINUX");
    return out;
}

/**
 * Parses a Steam release date string into a `Date` object, normalised to midnight UTC.
 * Returns `null` for unreleased ("coming soon") games or unparseable strings.
 *
 * @param dateStr - The `release_date.date` string from the Steam API (e.g. `"21 Nov, 2023"`).
 * @param comingSoon - The `release_date.coming_soon` flag from the Steam API.
 * @returns A midnight-normalised `Date`, or `null` if the date cannot be determined.
 */
export function parseSteamReleaseDate(dateStr?: string, comingSoon?: boolean): Date | null {
    if (comingSoon || !dateStr) return null;

    try {
        const parsed = parseDate(dateStr);

        if (!parsed || isNaN(parsed.getTime())) return null;

        return new Date(parsed.setHours(0, 0, 0, 0));
    } catch {
        return null;
    }
}

/**
 * Fetches the full list of games owned by a Steam user via the IPlayerService API.
 * Acquires a rate-limit slot before making the request.
 *
 * @param steamId - The 64-bit Steam ID of the user whose library to retrieve.
 * @returns Array of owned game objects including playtime and last-played timestamps.
 * @throws {Error} If the HTTP request fails with a non-OK status.
 */
export async function fetchSteamOwnedGames(steamId: string): Promise<SteamOwnedGame[]> {
    await steamRateLimiter.acquire();
    const steamApiKey = getWorkerEnv().STEAM_API_KEY;

    const response = await fetch(
        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamApiKey}&steamid=${steamId}&include_appinfo=true&skip_unvetted_apps=false&include_played_free_games=true&include_free_sub=true&format=json`,
        {
            headers: { Accept: "application/json" }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch owned games for ${steamId}: ${response.status}`);
    }

    const data = await response.json() as { response?: { games: SteamOwnedGame[] } };
    return data.response?.games || [];
}

/**
 * Fetches detailed metadata for a single Steam app from the store API.
 * Acquires a rate-limit slot before making the request.
 *
 * @param appId - The Steam App ID to fetch details for.
 * @returns A `SteamAppDetails` object, or `null` if Steam reports the app as unavailable.
 * @throws {SteamRateLimitError} If Steam returns HTTP 429 or 403.
 * @throws {Error} If the HTTP request fails with any other non-OK status.
 */
export async function fetchGameDetails(appId: number): Promise<SteamAppDetails | null> {
    await steamRateLimiter.acquire();

    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=en`, {
        headers: { Accept: "application/json" }
    });

    if (response.status === 429 || response.status === 403) {
        throw new SteamRateLimitError(appId, response.status);
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch game details for appId ${appId}: ${response.status}`);
    }

    const data = await response.json() as { [key: string]: { success: boolean; data?: SteamAppDetails } };
    const gameData = data[appId.toString()];

    if (gameData?.success && gameData.data) {
        return gameData.data as SteamAppDetails;
    }

    return null;
}