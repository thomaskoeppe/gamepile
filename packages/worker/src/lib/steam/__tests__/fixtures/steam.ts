/**
 * Steam API payload fixtures.
 *
 * `validStoreItem` mirrors the shape of a real IStoreBrowseService/GetItems
 * response. Everything below it is a payload Steam has actually been observed to
 * return — empty envelopes under load, HTML maintenance pages served with HTTP
 * 200, partial items with fields dropped — and which previously crashed a sync.
 */

/** A fully populated, well-formed store item. */
export function validStoreItem(overrides: Record<string, unknown> = {}) {
    return {
        item_type: 0,
        id: 220,
        success: 1,
        visible: true,
        name: "Half-Life 2",
        appid: 220,
        type: 0,
        is_free: false,
        is_early_access: false,
        tagids: [1, 2, 3],
        tags: [
            { tagid: 1, weight: 100 },
            { tagid: 2, weight: 50 },
        ],
        categories: {
            supported_player_categoryids: [2],
            feature_categoryids: [22, 29],
            controller_categoryids: [28],
        },
        basic_info: {
            short_description: "A first-person shooter.",
            developers: [{ name: "Valve" }],
            publishers: [{ name: "Valve" }],
            franchises: [{ name: "Half-Life" }],
        },
        full_description_bbcode: "[b]Half-Life 2[/b]",
        release: { steam_release_date: 1_099_267_200, is_coming_soon: false },
        platforms: { windows: true, mac: true, steamos_linux: true, steam_deck_compat_category: 3 },
        reviews: {
            summary_filtered: {
                review_score: 9,
                percent_positive: 97,
                review_count: 100_000,
                review_score_label: "Overwhelmingly Positive",
            },
        },
        assets: {
            asset_url_format: "steam/apps/220/${FILENAME}",
            header: "header.jpg",
            main_capsule: "capsule_616x353.jpg",
            library_capsule: "library_600x900.jpg",
            library_hero: "library_hero.jpg",
            hero_capsule: "hero_capsule.jpg",
        },
        screenshots: {
            all_ages_screenshots: [
                { filename: "ss_b.jpg", ordinal: 1 },
                { filename: "ss_a.jpg", ordinal: 0 },
            ],
        },
        trailers: {
            highlights: [
                {
                    trailer_name: "Launch Trailer",
                    trailer_url_format: "steam/apps/220/${FILENAME}",
                    adaptive_trailers: [
                        { encoding: "hls_h264", cdn_path: "trailer.m3u8" },
                        { encoding: "webm", cdn_path: "trailer.webm" },
                    ],
                },
            ],
        },
        ...overrides,
    };
}

/** Wraps items in the standard GetItems envelope. */
export function storeBrowseEnvelope(items: unknown[]) {
    return { response: { store_items: items } };
}

/** A well-formed GetAppList page. */
export function appListEnvelope(apps: unknown[], opts: { haveMore?: boolean; lastAppId?: number } = {}) {
    return {
        response: {
            apps,
            have_more_results: opts.haveMore ?? false,
            last_appid: opts.lastAppId ?? 0,
        },
    };
}

export function validApp(overrides: Record<string, unknown> = {}) {
    return { appid: 440, name: "Team Fortress 2", last_modified: 1_700_000_000, price_change_number: 1, ...overrides };
}

/**
 * Envelopes Steam returns instead of data. Each of these used to throw a
 * TypeError at `data.response.<key>` and abort the whole job.
 */
export const MALFORMED_ENVELOPES: Array<{ label: string; payload: unknown }> = [
    { label: "empty object", payload: {} },
    { label: "null response", payload: { response: null } },
    { label: "response is a string", payload: { response: "unavailable" } },
    { label: "response missing the array key", payload: { response: {} } },
    { label: "array key is null", payload: { response: { store_items: null, apps: null } } },
    { label: "array key is an object", payload: { response: { store_items: {}, apps: {} } } },
    { label: "top-level null", payload: null },
    { label: "top-level array", payload: [] },
    { label: "top-level string", payload: "gateway timeout" },
];

/** A Cloudflare-style HTML error page, which Steam serves with HTTP 200. */
export const HTML_MAINTENANCE_PAGE = `<!DOCTYPE html>
<html><head><title>Steam Community :: Error</title></head>
<body><h1>Sorry!</h1><p>An error was encountered while processing your request.</p></body></html>`;

/** A response body cut off mid-object, as happens on a dropped connection. */
export const TRUNCATED_JSON = '{"response": {"store_items": [{"appid": 220, "na';

/** Builds a `fetch` stand-in returning a JSON body. */
export function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/** Builds a `fetch` stand-in returning a non-JSON body at the given status. */
export function textResponse(body: string, status = 200, contentType = "text/html"): Response {
    return new Response(body, { status, headers: { "content-type": contentType } });
}
