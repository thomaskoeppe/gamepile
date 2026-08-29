/**
 * schemas.ts
 *
 * Runtime validation for Steam Web API responses.
 *
 * The clients previously cast with `as StoreBrowseResponse`, which TypeScript
 * erases — the shapes were never checked at runtime, so a missing `response` key
 * crashed the job and a missing `appid` silently keyed a Map by `undefined`.
 *
 * The schemas here are deliberately permissive. Steam omits fields, ships partial
 * items, and adds keys without notice, so a strict schema would reject valid data
 * and lose games. Only genuinely load-bearing fields are required; everything the
 * mappers already treat as optional stays optional, and unknown keys pass through.
 *
 * Validation is applied **per item**, never per response: one malformed game must
 * not discard the other 49 in its batch.
 */

import { z } from "zod";

/** Coerces Steam's inconsistent numeric fields, which arrive as both 5 and "5". */
const numeric = z.coerce.number();

const assetsSchema = z
    .object({
        asset_url_format: z.string().optional(),
        header: z.string().optional(),
        main_capsule: z.string().optional(),
        library_capsule: z.string().optional(),
        library_hero: z.string().optional(),
        hero_capsule: z.string().optional(),
    })
    .loose();

const screenshotSchema = z
    .object({
        filename: z.string(),
        // Steam occasionally omits ordinal; the mapper sorts on it, so default it
        // rather than letting the comparator go NaN.
        ordinal: numeric.optional().default(0),
    })
    .loose();

const trailerSchema = z
    .object({
        trailer_name: z.string().optional(),
        trailer_url_format: z.string().optional(),
        adaptive_trailers: z
            .array(
                z
                    .object({
                        encoding: z.string().optional(),
                        // Optional on purpose. Requiring it here would fail the
                        // whole item schema and discard an entire game over one
                        // bad trailer; the mapper drops the individual trailer
                        // instead, which is where that decision belongs.
                        cdn_path: z.string().optional(),
                    })
                    .loose(),
            )
            .optional(),
    })
    .loose();

const namedEntrySchema = z.object({ name: z.string() }).loose();

/**
 * A single store item. `appid` is the only hard requirement — it is the primary
 * key everything downstream is filed under.
 */
export const storeBrowseItemSchema = z
    .object({
        appid: numeric,
        success: numeric.optional().default(0),
        name: z.string().optional().default(""),
        type: numeric.optional().default(-1),
        is_free: z.boolean().optional(),
        is_early_access: z.boolean().optional(),
        full_description_bbcode: z.string().optional(),
        tagids: z.array(numeric).optional(),
        tags: z.array(z.object({ tagid: numeric, weight: numeric.optional() }).loose()).optional(),
        categories: z
            .object({
                supported_player_categoryids: z.array(numeric).optional(),
                feature_categoryids: z.array(numeric).optional(),
                controller_categoryids: z.array(numeric).optional(),
            })
            .loose()
            .optional(),
        basic_info: z
            .object({
                short_description: z.string().optional(),
                publishers: z.array(namedEntrySchema).optional(),
                developers: z.array(namedEntrySchema).optional(),
                franchises: z.array(namedEntrySchema).optional(),
            })
            .loose()
            .optional(),
        release: z
            .object({
                steam_release_date: numeric.optional(),
                is_coming_soon: z.boolean().optional(),
                is_early_access: z.boolean().optional(),
            })
            .loose()
            .optional(),
        platforms: z
            .object({
                windows: z.boolean().optional(),
                mac: z.boolean().optional(),
                steamos_linux: z.boolean().optional(),
                steam_deck_compat_category: numeric.optional(),
            })
            .loose()
            .optional(),
        reviews: z
            .object({
                summary_filtered: z
                    .object({
                        review_score: numeric.optional(),
                        percent_positive: numeric.optional(),
                        review_count: numeric.optional(),
                        review_score_label: z.string().optional(),
                    })
                    .loose()
                    .optional(),
            })
            .loose()
            .optional(),
        assets: assetsSchema.optional(),
        assets_without_overrides: assetsSchema.optional(),
        screenshots: z
            .object({
                all_ages_screenshots: z.array(screenshotSchema).optional(),
                mature_content_screenshots: z.array(screenshotSchema).optional(),
            })
            .loose()
            .optional(),
        trailers: z
            .object({ highlights: z.array(trailerSchema).optional() })
            .loose()
            .optional(),
    })
    .loose();

export type ValidatedStoreBrowseItem = z.infer<typeof storeBrowseItemSchema>;

/** A single app entry from IStoreService/GetAppList. */
export const steamAppSchema = z
    .object({
        appid: numeric,
        name: z.string().optional().default(""),
        last_modified: numeric.optional().default(0),
        price_change_number: numeric.optional().default(0),
    })
    .loose();

/** A single achievement definition from ISteamUserStats/GetSchemaForGame. */
export const achievementDefSchema = z
    .object({
        name: z.string(),
        displayName: z.string().optional().default(""),
        description: z.string().optional(),
        icon: z.string().optional().default(""),
        icongray: z.string().optional().default(""),
        hidden: numeric.optional().default(0),
    })
    .loose();

/** A single per-user achievement from ISteamUserStats/GetPlayerAchievements. */
export const playerAchievementSchema = z
    .object({
        apiname: z.string(),
        achieved: numeric.optional().default(0),
        unlocktime: numeric.optional().default(0),
    })
    .loose();

/** A single tag from IStoreService/GetTagList. */
export const steamTagSchema = z
    .object({
        tagid: numeric,
        name: z.string(),
    })
    .loose();

/** A single category from IStoreBrowseService/GetStoreCategories. */
export const steamCategorySchema = z
    .object({
        categoryid: numeric,
        type: numeric.optional().default(0),
        internal_name: z.string().optional().default(""),
        display_name: z.string().optional().default(""),
    })
    .loose();

/**
 * Pulls an array out of a Steam envelope without assuming any of it exists.
 *
 * Steam returns `{}`, `{"response": null}`, and occasionally a non-array where an
 * array belongs. All three resolve to an empty list here instead of throwing,
 * which is the fix for the crashes in store-browse and get-app-list.
 *
 * @param payload - The raw decoded body.
 * @param envelopeKey - Top-level key holding the envelope, e.g. `"response"`.
 * @param arrayKey - Key inside the envelope holding the array.
 * @returns The raw array entries, or `[]` when absent or the wrong type.
 */
export function extractEnvelopeArray(payload: unknown, envelopeKey: string, arrayKey: string): unknown[] {
    if (!payload || typeof payload !== "object") return [];

    const envelope = (payload as Record<string, unknown>)[envelopeKey];
    if (!envelope || typeof envelope !== "object") return [];

    const value = (envelope as Record<string, unknown>)[arrayKey];
    return Array.isArray(value) ? value : [];
}

/**
 * Reads a scalar field from a Steam envelope, tolerating a missing envelope.
 *
 * @param payload - The raw decoded body.
 * @param envelopeKey - Top-level envelope key.
 * @param field - Field to read from within the envelope.
 * @returns The raw value, or `undefined` when any level is absent.
 */
export function readEnvelopeField(payload: unknown, envelopeKey: string, field: string): unknown {
    if (!payload || typeof payload !== "object") return undefined;

    const envelope = (payload as Record<string, unknown>)[envelopeKey];
    if (!envelope || typeof envelope !== "object") return undefined;

    return (envelope as Record<string, unknown>)[field];
}

export interface ParsedItems<T> {
    /** Entries that satisfied the schema. */
    valid: T[];
    /** Entries that did not, with the reason, for logging and failure counting. */
    invalid: Array<{ reason: string; raw: unknown }>;
}

/**
 * Validates entries individually so a malformed one cannot discard its batch.
 *
 * @param entries - Raw entries from {@link extractEnvelopeArray}.
 * @param schema - Schema each entry must satisfy.
 * @returns The valid entries and a description of each rejection.
 */
export function parseItems<T>(entries: unknown[], schema: z.ZodType<T>): ParsedItems<T> {
    const valid: T[] = [];
    const invalid: Array<{ reason: string; raw: unknown }> = [];

    for (const entry of entries) {
        const result = schema.safeParse(entry);

        if (result.success) {
            valid.push(result.data);
            continue;
        }

        const reason = result.error.issues
            .slice(0, 3)
            .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
            .join("; ");

        invalid.push({ reason, raw: entry });
    }

    return { valid, invalid };
}
