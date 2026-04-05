import { steamRateLimiter } from "@/src/lib/steam/ratelimiter.js";
import { getWorkerEnv } from "@/src/lib/env.js";

/**
 * Represents a single owned game entry returned by the Steam IPlayerService/GetOwnedGames API.
 */
export type SteamOwnedGame = {
    /** Steam application ID. */
    appid: number;
    /** Display name of the game (included when `include_appinfo` is `true`). */
    name?: string;
    /** Total playtime in minutes across all time. */
    playtime_forever?: number;
    /** Playtime in the last two weeks, in minutes. */
    playtime_2weeks?: number;
    /** Unix timestamp of the last time the game was played. */
    rtime_last_played?: number;
};

/**
 * Fetches the list of owned games for a Steam user from the IPlayerService/GetOwnedGames API.
 *
 * Includes free games, unvetted apps, and app info (names). Automatically respects
 * the global Steam rate limiter before making the HTTP request.
 *
 * @param steamId - The 64-bit Steam ID of the user.
 * @returns Array of owned games with playtime data.
 * @throws {Error} If the HTTP response status indicates a failure.
 */
export async function fetchSteamOwnedGames(steamId: string): Promise<SteamOwnedGame[]> {
    await steamRateLimiter.acquire();
    const steamApiKey = getWorkerEnv().STEAM_API_KEY;

    const response = await fetch(
        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamApiKey}&steamid=${steamId}&include_appinfo=true&skip_unvetted_apps=false&include_played_free_games=true&include_free_sub=true&format=json`,
        { headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch owned games for ${steamId}: ${response.status}`);
    }

    const data = await response.json() as { response?: { games: SteamOwnedGame[] } };
    return data.response?.games || [];
}
