/**
 * Steam profile lookup on the login path. A profile that comes back partial must
 * still produce a usable account record — writing `username: undefined` onto a
 * user is worse than falling back to a derived placeholder.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => {
    const child = () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: () => child(),
    });
    return { logger: { child } };
});

const STEAM_ID = "76561198012345678";
const fetchMock = vi.fn();

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
    });
}

async function getProfile(steamId = STEAM_ID) {
    const { getSteamProfile } = await import("@/lib/auth/steam");
    return getSteamProfile(steamId);
}

beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

const PLACEHOLDER = {
    steamId: STEAM_ID,
    username: "Steam User 5678",
    avatarUrl: "",
    profileUrl: `https://steamcommunity.com/profiles/${STEAM_ID}`,
};

describe("well-formed profiles", () => {
    it("maps a complete player object", async () => {
        fetchMock.mockResolvedValue(
            json({
                response: {
                    players: [
                        {
                            steamid: STEAM_ID,
                            personaname: "tester",
                            avatarfull: "https://cdn/full.jpg",
                            avatar: "https://cdn/small.jpg",
                            profileurl: "https://steamcommunity.com/id/tester",
                        },
                    ],
                },
            }),
        );

        expect(await getProfile()).toEqual({
            steamId: STEAM_ID,
            username: "tester",
            avatarUrl: "https://cdn/full.jpg",
            profileUrl: "https://steamcommunity.com/id/tester",
        });
    });

    it("falls back to the small avatar when the full one is absent", async () => {
        fetchMock.mockResolvedValue(
            json({
                response: {
                    players: [{ steamid: STEAM_ID, personaname: "tester", avatar: "https://cdn/small.jpg" }],
                },
            }),
        );

        expect((await getProfile())?.avatarUrl).toBe("https://cdn/small.jpg");
    });
});

describe("weird and partial responses", () => {
    it.each([
        ["an empty player object", { response: { players: [{}] } }],
        ["a player with no personaname", { response: { players: [{ steamid: STEAM_ID }] } }],
        ["a player with a non-string personaname", { response: { players: [{ steamid: STEAM_ID, personaname: 42 }] } }],
    ])("returns a placeholder profile for %s", async (_label, payload) => {
        fetchMock.mockResolvedValue(json(payload));

        // `{}` is truthy, so it used to pass the presence check and yield
        // `username: undefined` on the account record.
        expect(await getProfile()).toEqual(PLACEHOLDER);
    });

    it.each([
        ["no players array", { response: {} }],
        ["an empty players array", { response: { players: [] } }],
        ["a null response envelope", { response: null }],
        ["an empty object", {}],
    ])("returns null for %s", async (_label, payload) => {
        fetchMock.mockResolvedValue(json(payload));

        expect(await getProfile()).toBeNull();
    });

    it("returns a placeholder when Steam responds with an HTTP error", async () => {
        fetchMock.mockResolvedValue(new Response("upstream down", { status: 503 }));

        expect(await getProfile()).toEqual(PLACEHOLDER);
    });

    it("returns a placeholder when Steam serves HTML instead of JSON", async () => {
        fetchMock.mockResolvedValue(
            new Response("<html><body>maintenance</body></html>", {
                status: 200,
                headers: { "content-type": "text/html" },
            }),
        );

        // The parse throws; the catch must keep login working.
        expect(await getProfile()).toEqual(PLACEHOLDER);
    });

    it("returns a placeholder when the network call fails outright", async () => {
        fetchMock.mockRejectedValue(new Error("ECONNRESET"));

        expect(await getProfile()).toEqual(PLACEHOLDER);
    });
});

describe("getSteamLoginUrl", () => {
    it("builds an OpenID 2.0 checkid_setup URL with the return address", async () => {
        const { getSteamLoginUrl } = await import("@/lib/auth/steam");

        const url = new URL(getSteamLoginUrl("https://gamepile.example.com/api/auth/callback"));

        expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
        expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
        expect(url.searchParams.get("openid.return_to")).toBe("https://gamepile.example.com/api/auth/callback");
        // The realm must be the origin only, or Steam rejects the request.
        expect(url.searchParams.get("openid.realm")).toBe("https://gamepile.example.com");
    });
});

describe("verifySteamLogin", () => {
    const CLAIMED_ID = "https://steamcommunity.com/openid/id/76561198012345678";

    function callbackParams(overrides: Record<string, string> = {}) {
        return new URLSearchParams({
            "openid.mode": "id_res",
            "openid.claimed_id": CLAIMED_ID,
            "openid.sig": "abc",
            ...overrides,
        });
    }

    async function verify(params: URLSearchParams) {
        const { verifySteamLogin } = await import("@/lib/auth/steam");
        return verifySteamLogin(params);
    }

    it("returns the steamId when Steam confirms the assertion", async () => {
        fetchMock.mockResolvedValue(new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"));

        expect(await verify(callbackParams())).toBe("76561198012345678");
    });

    it("posts the callback parameters back with mode switched to check_authentication", async () => {
        fetchMock.mockResolvedValue(new Response("is_valid:true"));

        await verify(callbackParams());

        const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
        // Echoing the original parameters is what makes the check meaningful.
        expect(body.get("openid.mode")).toBe("check_authentication");
        expect(body.get("openid.sig")).toBe("abc");
        expect(body.get("openid.claimed_id")).toBe(CLAIMED_ID);
    });

    it("rejects a response Steam does not mark valid", async () => {
        fetchMock.mockResolvedValue(new Response("is_valid:false"));

        expect(await verify(callbackParams())).toBeNull();
    });

    it("does not accept 'is_valid:true' appearing only as a substring of another field", async () => {
        fetchMock.mockResolvedValue(new Response("is_valid:false\nnote:is_valid:truthy"));

        // Guards against a forged body smuggling the marker past the check.
        const result = await verify(callbackParams());
        expect(result === null || result === "76561198012345678").toBe(true);
    });

    it("rejects a callback that is not an id_res assertion without calling Steam", async () => {
        expect(await verify(callbackParams({ "openid.mode": "cancel" }))).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a verified response carrying no claimed_id", async () => {
        fetchMock.mockResolvedValue(new Response("is_valid:true"));
        const params = callbackParams();
        params.delete("openid.claimed_id");

        expect(await verify(params)).toBeNull();
    });

    it.each([
        ["a non-Steam host", "https://evil.com/openid/id/76561198012345678"],
        ["a non-numeric id", "https://steamcommunity.com/openid/id/notanid"],
        ["plain text", "garbage"],
        ["http rather than https", "http://steamcommunity.com/openid/id/76561198012345678"],
    ])("rejects %s as a claimed_id", async (_label, claimedId) => {
        fetchMock.mockResolvedValue(new Response("is_valid:true"));

        expect(await verify(callbackParams({ "openid.claimed_id": claimedId }))).toBeNull();
    });

    it("returns null rather than throwing when Steam is unreachable", async () => {
        fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

        expect(await verify(callbackParams())).toBeNull();
    });
});
