import { getWorkerEnv } from "@/src/lib/env.js";
import { logger } from "@/src/lib/logger.js";
import { fetchSteamJson, SteamResponseError } from "@/src/lib/steam/api/fetch-json.js";
import { achievementDefSchema, parseItems, playerAchievementSchema } from "@/src/lib/steam/api/schemas.js";
import { steamRateLimiter, SteamRateLimitError } from "@/src/lib/steam/ratelimiter.js";

const log = logger.child("worker.lib.steam:achievements");

/**
 * A single achievement definition from ISteamUserStats/GetSchemaForGame.
 */
export type SteamAchievementDef = {
    /** Internal API name (stable identifier within the game). */
    name: string;
    /** Human-readable display name. */
    displayName: string;
    /** Description text — omitted by Steam for some hidden achievements. */
    description?: string;
    /** URL of the unlocked (colored) icon. */
    icon: string;
    /** URL of the locked (gray) icon. */
    icongray: string;
    /** `1` when the achievement is hidden until unlocked. */
    hidden: number;
};

type SchemaForGameResponse = {
    game?: {
        availableGameStats?: {
            achievements?: SteamAchievementDef[];
        };
    };
};

/**
 * A single per-user achievement entry from ISteamUserStats/GetPlayerAchievements.
 */
export type SteamPlayerAchievement = {
    /** Internal API name — matches {@link SteamAchievementDef.name}. */
    apiname: string;
    /** `1` when the user has unlocked this achievement. */
    achieved: 0 | 1;
    /** Unix timestamp of the unlock, or `0` when unknown/locked. */
    unlocktime: number;
};

type PlayerAchievementsResponse = {
    playerstats?: {
        success?: boolean;
        error?: string;
        achievements?: SteamPlayerAchievement[];
    };
};

/**
 * Result of a player-achievements lookup. Expected per-app conditions
 * (no stats, private profile) are modeled as values instead of thrown
 * errors so callers can count them as processed rather than failed.
 */
export type PlayerAchievementsResult =
    { ok: true; achievements: SteamPlayerAchievement[] } | { ok: false; reason: "no-stats" | "profile-private" };

/**
 * Fetches the achievement schema (definitions) for a game from
 * ISteamUserStats/GetSchemaForGame/v2.
 *
 * @param appId - Steam application ID.
 * @returns All achievement definitions, or an empty array when the game has none.
 * @throws {SteamRateLimitError} If Steam responds with HTTP 429 or 403.
 * @throws {Error} If the HTTP request fails for any other reason.
 */
export async function fetchGameAchievementSchema(appId: number): Promise<SteamAchievementDef[]> {
    const steamApiKey = getWorkerEnv().STEAM_API_KEY;

    const payload = await fetchSteamJson(
        `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${steamApiKey}&appid=${appId}&l=english&format=json`,
        { endpoint: "ISteamUserStats/GetSchemaForGame", appId },
    );

    const raw = (payload as SchemaForGameResponse | null)?.game?.availableGameStats?.achievements;
    if (!Array.isArray(raw)) return [];

    // A game with one malformed achievement definition should still import the
    // rest, so entries are validated individually.
    const { valid, invalid } = parseItems(raw, achievementDefSchema);

    if (invalid.length > 0) {
        log.warn("Discarded malformed achievement definitions", {
            appId,
            returned: raw.length,
            discarded: invalid.length,
            reasons: invalid.slice(0, 3).map((entry) => entry.reason),
        });
    }

    return valid as SteamAchievementDef[];
}

/**
 * Fetches a user's per-game achievement unlocks from
 * ISteamUserStats/GetPlayerAchievements/v1.
 *
 * Steam signals expected conditions via non-2xx responses with a JSON body:
 * "Requested app has no stats" (HTTP 400) and "Profile is not public"
 * (HTTP 403). Both are returned as `{ ok: false }` results — note that a 403
 * carrying the private-profile body is NOT treated as rate limiting.
 *
 * @param steamId - The 64-bit Steam ID of the user.
 * @param appId - Steam application ID.
 * @returns The unlock list, or a typed "expected miss" result.
 * @throws {SteamRateLimitError} If Steam responds with HTTP 429, or 403 without a private-profile body.
 * @throws {Error} If the HTTP request fails for any other reason.
 */
export async function fetchPlayerAchievements(steamId: string, appId: number): Promise<PlayerAchievementsResult> {
    await steamRateLimiter.acquire();
    const steamApiKey = getWorkerEnv().STEAM_API_KEY;

    const response = await fetch(
        `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${steamApiKey}&steamid=${steamId}&appid=${appId}&format=json`,
        { headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as PlayerAchievementsResponse | null;
        const errorText = body?.playerstats?.error;

        if (errorText?.includes("no stats")) {
            return { ok: false, reason: "no-stats" };
        }
        if (errorText?.includes("not public")) {
            return { ok: false, reason: "profile-private" };
        }

        if (response.status === 429 || response.status === 403) {
            steamRateLimiter.reportRateLimit();
            throw new SteamRateLimitError(appId, response.status);
        }

        throw new Error(
            `Failed to fetch player achievements for appId ${appId}: HTTP ${response.status}` +
                (errorText ? ` (${errorText})` : ""),
        );
    }

    // Guarded: Steam serves HTML maintenance pages with HTTP 200, which made
    // response.json() throw a SyntaxError naming neither the endpoint nor the body.
    const body = await response.text();

    let data: PlayerAchievementsResponse | null;
    try {
        data = JSON.parse(body) as PlayerAchievementsResponse;
    } catch {
        throw new SteamResponseError(
            "ISteamUserStats/GetPlayerAchievements",
            response.status,
            response.headers.get("content-type"),
            body.slice(0, 200).replace(/\s+/g, " ").trim() || "<empty body>",
        );
    }

    if (data?.playerstats?.success === false) {
        const errorText = data.playerstats.error ?? "";
        if (errorText.includes("not public")) {
            return { ok: false, reason: "profile-private" };
        }
        return { ok: false, reason: "no-stats" };
    }

    const raw = data?.playerstats?.achievements;
    if (!Array.isArray(raw)) return { ok: true, achievements: [] };

    const { valid, invalid } = parseItems(raw, playerAchievementSchema);

    if (invalid.length > 0) {
        log.warn("Discarded malformed player achievements", {
            appId,
            steamId,
            discarded: invalid.length,
        });
    }

    return { ok: true, achievements: valid as SteamPlayerAchievement[] };
}
