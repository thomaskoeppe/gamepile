import { logger } from "@/lib/logger";

const log = logger.child("server.services.auth:steam");

export interface SteamProfile {
    steamId: string
    username: string
    avatarUrl: string
    profileUrl: string
}

/**
 * Generate Steam OpenID 2.0 authentication URL
 */
export function getSteamLoginUrl(returnUrl: string): string {
    const params = new URLSearchParams({
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": returnUrl,
        "openid.realm": new URL(returnUrl).origin,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    });

    return `https://steamcommunity.com/openid/login?${params.toString()}`;
}

/**
 * Verify Steam OpenID 2.0 response
 */
export async function verifySteamLogin(searchParams: URLSearchParams): Promise<string | null> {
    const mode = searchParams.get("openid.mode");
    if (mode !== "id_res") {
        log.warn("Steam verification skipped — unexpected openid.mode", { mode });
        return null;
    }

    const verifyParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
        verifyParams.append(key, value);
    });
    verifyParams.set("openid.mode", "check_authentication");

    try {
        log.debug("Verifying Steam OpenID response");

        const response = await fetch("https://steamcommunity.com/openid/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: verifyParams.toString(),
        });

        const text = await response.text();

        if (!text.includes("is_valid:true")) {
            log.warn("Steam OpenID verification rejected by Steam", {
                responseStatus: response.status,
                isValid: false,
            });
            return null;
        }

        const claimedId = searchParams.get("openid.claimed_id");
        if (!claimedId) {
            log.warn("Steam verification succeeded but no claimed_id present");
            return null;
        }

        const steamIdMatch = claimedId.match(
            /https:\/\/steamcommunity\.com\/openid\/id\/(\d+)/
        );
        if (!steamIdMatch) {
            log.warn("Steam verification succeeded but claimed_id format invalid", { claimedId });
            return null;
        }

        const steamId = steamIdMatch[1];
        log.info("Steam login verified", { steamId });
        return steamId;
    } catch (error) {
        log.error("Steam verification error", error instanceof Error ? error : new Error(String(error)));
        return null;
    }
}

/**
 * Fetch Steam user profile using Steam Web API
 */
export async function getSteamProfile(steamId: string): Promise<SteamProfile | null> {
    log.debug("Fetching Steam profile", { steamId });

    try {
        const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`;
        const response = await fetch(url);

        if (!response.ok) {
            log.error("Failed to fetch Steam profile — HTTP error", new Error(`Steam API returned ${response.status} ${response.statusText}`), {
                steamId,
                status: response.status,
                statusText: response.statusText,
            });

            return {
                steamId,
                username: `Steam User ${steamId.slice(-4)}`,
                avatarUrl: "",
                profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
            };
        }

        const data = await response.json();
        const player = data?.response?.players?.[0];

        if (!player) {
            log.warn("Steam API returned no player data", { steamId });
            return null;
        }

        log.info("Steam profile fetched", { steamId, username: player.personaname });

        return {
            steamId: player.steamid,
            username: player.personaname,
            avatarUrl: player.avatarfull || player.avatar,
            profileUrl: player.profileurl,
        };
    } catch (error) {
        log.error("Error fetching Steam profile", error instanceof Error ? error : new Error(String(error)));

        return {
            steamId,
            username: `Steam User ${steamId.slice(-4)}`,
            avatarUrl: "",
            profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
        };
    }
}
