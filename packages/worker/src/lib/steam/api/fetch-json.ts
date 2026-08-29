/**
 * fetch-json.ts
 *
 * Single entry point for every Steam Web API call.
 *
 * Steam is not a well-behaved JSON API. It serves HTML maintenance and CDN error
 * pages with HTTP 200, returns `{}` or `{"response": null}` under load, and drops
 * fields without notice. Each client used to handle that differently — two of the
 * three dereferenced `data.response` unguarded and crashed the whole job on an
 * empty envelope, while a non-JSON body surfaced as a bare `SyntaxError` naming
 * neither the endpoint nor the content type.
 *
 * This module centralises the fetch, the rate-limit mapping, and the parse so
 * there is one behaviour to reason about and one place to test.
 */

import { logger } from "@/src/lib/logger.js";
import { SteamRateLimitError, steamRateLimiter } from "@/src/lib/steam/ratelimiter.js";

const log = logger.child("worker.lib.steam:fetchJson");

/** How much of an unexpected response body to keep for diagnostics. */
const BODY_SNIPPET_LENGTH = 200;

/**
 * Raised when Steam answers with something that is not usable JSON — an HTML
 * maintenance page, a truncated body, or a proxy error page served as 200.
 *
 * Carries enough context to identify the endpoint and what actually came back,
 * which a raw `SyntaxError` does not.
 */
export class SteamResponseError extends Error {
    readonly status: number;
    readonly contentType: string | null;
    readonly bodySnippet: string;

    constructor(endpoint: string, status: number, contentType: string | null, bodySnippet: string) {
        super(
            `Steam returned a non-JSON response from ${endpoint} ` +
                `(HTTP ${status}, content-type: ${contentType ?? "unknown"}): ${bodySnippet}`,
        );
        this.name = "SteamResponseError";
        this.status = status;
        this.contentType = contentType;
        this.bodySnippet = bodySnippet;
    }
}

export interface SteamFetchOptions {
    /** Short label used in logs and error messages, e.g. "IStoreBrowseService/GetItems". */
    endpoint: string;
    /**
     * appId reported on a rate-limit error. Steam's limiter is global rather than
     * per-app, so this is only for diagnostics.
     */
    appId?: number;
    /** Skips `steamRateLimiter.acquire()`. Only for callers that already acquired. */
    skipRateLimiter?: boolean;
}

/**
 * Fetches a Steam endpoint and returns the decoded body as `unknown`.
 *
 * Returning `unknown` rather than a cast type is deliberate: every caller must
 * run the payload through a schema. The previous `as SomeResponse` casts were
 * erased at runtime and provided no protection whatsoever.
 *
 * @param url - Fully-formed request URL, including the API key and query string.
 * @param options - Endpoint label and rate-limit behaviour.
 * @returns The parsed JSON body, untyped.
 * @throws {SteamRateLimitError} On HTTP 429 or 403.
 * @throws {SteamResponseError} When the body is not valid JSON.
 * @throws {Error} On any other non-OK HTTP status.
 */
export async function fetchSteamJson(url: string, options: SteamFetchOptions): Promise<unknown> {
    const { endpoint, appId = 0, skipRateLimiter = false } = options;

    if (!skipRateLimiter) {
        await steamRateLimiter.acquire();
    }

    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (response.status === 429 || response.status === 403) {
        steamRateLimiter.reportRateLimit();
        throw new SteamRateLimitError(appId, response.status);
    }

    if (!response.ok) {
        throw new Error(`${endpoint} request failed: HTTP ${response.status} ${response.statusText}`);
    }

    // Read as text first. `response.json()` on an HTML body throws a SyntaxError
    // that names neither the endpoint nor what was actually served.
    const body = await response.text();

    try {
        return JSON.parse(body) as unknown;
    } catch {
        const snippet = body.slice(0, BODY_SNIPPET_LENGTH).replace(/\s+/g, " ").trim();
        const contentType = response.headers.get("content-type");

        log.error("Steam returned a non-JSON body", undefined, {
            endpoint,
            status: response.status,
            contentType,
            bodyLength: body.length,
        });

        throw new SteamResponseError(endpoint, response.status, contentType, snippet || "<empty body>");
    }
}
