/**
 * Shared validation for user-chosen custom URL slugs used by Vaults (#10) and
 * Collections (#11). Slugs are globally unique and resolved interchangeably with
 * the record id on the `/vaults/[id]` and `/collections/[id]` routes, so the
 * rules here deliberately prevent a slug from shadowing a route segment or
 * colliding with a cuid.
 */

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

/** Lowercase alphanumeric segments joined by single hyphens (no leading/trailing/double hyphen). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Shape of a cuid (`@default(cuid())`), excluded so slug-or-id resolution stays unambiguous. */
const CUID_PATTERN = /^c[a-z0-9]{24}$/;

/**
 * Route segments and common words that must never be claimable as a slug,
 * otherwise a slug could shadow a real route (e.g. `/collections/p/...`,
 * `/vaults/shared`, `/vaults/claim/...`).
 */
export const RESERVED_SLUGS = new Set<string>([
    "new",
    "create",
    "edit",
    "delete",
    "settings",
    "admin",
    "api",
    "me",
    "share",
    "shared",
    "claim",
    "p",
]);

/** Trims and lowercases raw input into the canonical slug form for storage/comparison. */
export function normalizeSlug(input: string): string {
    return input.trim().toLowerCase();
}

/** Returns a human-readable reason the slug is invalid, or `null` if it is valid. */
export function getSlugError(slug: string): string | null {
    if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
        return `URL must be between ${SLUG_MIN_LENGTH} and ${SLUG_MAX_LENGTH} characters.`;
    }
    if (!SLUG_PATTERN.test(slug)) {
        return "URL may only contain lowercase letters, numbers and single hyphens.";
    }
    if (CUID_PATTERN.test(slug)) {
        return "That URL is not allowed.";
    }
    if (RESERVED_SLUGS.has(slug)) {
        return "That URL is reserved.";
    }
    return null;
}

/** Whether a normalized slug satisfies every rule. */
export function isValidSlug(slug: string): boolean {
    return getSlugError(slug) === null;
}
