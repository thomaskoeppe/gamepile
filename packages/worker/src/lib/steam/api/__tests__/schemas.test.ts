/**
 * The envelope readers and per-item parser that keep one malformed Steam entry
 * from discarding an entire batch.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
    extractEnvelopeArray,
    parseItems,
    playerAchievementSchema,
    readEnvelopeField,
    steamAppSchema,
    storeBrowseItemSchema,
} from "../schemas.js";

describe("extractEnvelopeArray", () => {
    it("returns the array when the envelope is well-formed", () => {
        expect(extractEnvelopeArray({ response: { items: [1, 2] } }, "response", "items")).toEqual([1, 2]);
    });

    it.each([
        ["null payload", null],
        ["undefined payload", undefined],
        ["string payload", "gateway timeout"],
        ["number payload", 42],
        ["empty object", {}],
        ["null envelope", { response: null }],
        ["string envelope", { response: "unavailable" }],
        ["missing key", { response: {} }],
        ["null value", { response: { items: null } }],
        ["object where an array belongs", { response: { items: {} } }],
        ["string where an array belongs", { response: { items: "none" } }],
    ])("returns an empty array for %s", (_label, payload) => {
        expect(extractEnvelopeArray(payload, "response", "items")).toEqual([]);
    });

    it("does not treat an array payload as an envelope", () => {
        expect(extractEnvelopeArray([1, 2, 3], "response", "items")).toEqual([]);
    });
});

describe("readEnvelopeField", () => {
    it("reads a present field", () => {
        expect(readEnvelopeField({ response: { last_appid: 42 } }, "response", "last_appid")).toBe(42);
    });

    it.each([
        ["null payload", null],
        ["missing envelope", {}],
        ["null envelope", { response: null }],
        ["missing field", { response: {} }],
    ])("returns undefined for %s", (_label, payload) => {
        expect(readEnvelopeField(payload, "response", "last_appid")).toBeUndefined();
    });
});

describe("parseItems", () => {
    const schema = z.object({ id: z.number() });

    it("partitions valid from invalid entries", () => {
        const result = parseItems([{ id: 1 }, { id: "x" }, { id: 2 }, null], schema);

        // The whole point: two bad entries must not cost the two good ones.
        expect(result.valid).toEqual([{ id: 1 }, { id: 2 }]);
        expect(result.invalid).toHaveLength(2);
    });

    it("describes why an entry was rejected", () => {
        const result = parseItems([{ id: "not-a-number" }], schema);

        expect(result.invalid[0].reason).toContain("id");
        expect(result.invalid[0].raw).toEqual({ id: "not-a-number" });
    });

    it("handles an empty input list", () => {
        expect(parseItems([], schema)).toEqual({ valid: [], invalid: [] });
    });
});

describe("storeBrowseItemSchema", () => {
    it("requires an appid", () => {
        expect(storeBrowseItemSchema.safeParse({ name: "no id" }).success).toBe(false);
    });

    it("coerces a stringified appid, which Steam does send", () => {
        const result = storeBrowseItemSchema.safeParse({ appid: "220" });

        expect(result.success && result.data.appid).toBe(220);
    });

    it("defaults every optional field so a bare item still maps", () => {
        const result = storeBrowseItemSchema.safeParse({ appid: 220 });

        expect(result.success && result.data).toMatchObject({ appid: 220, name: "", success: 0, type: -1 });
    });

    it("keeps unknown keys rather than stripping them", () => {
        const result = storeBrowseItemSchema.safeParse({ appid: 220, some_new_steam_field: true });

        expect(result.success && (result.data as Record<string, unknown>).some_new_steam_field).toBe(true);
    });

    it("accepts a trailer with no cdn_path, leaving the mapper to drop it", () => {
        // Rejecting here would discard the entire game over one bad trailer.
        const result = storeBrowseItemSchema.safeParse({
            appid: 220,
            trailers: { highlights: [{ adaptive_trailers: [{ encoding: "hls_h264" }] }] },
        });

        expect(result.success).toBe(true);
    });

    it("defaults a missing screenshot ordinal to zero", () => {
        const result = storeBrowseItemSchema.safeParse({
            appid: 220,
            screenshots: { all_ages_screenshots: [{ filename: "a.jpg" }] },
        });

        expect(result.success && result.data.screenshots?.all_ages_screenshots?.[0].ordinal).toBe(0);
    });
});

describe("steamAppSchema", () => {
    it("requires an appid and defaults the rest", () => {
        expect(steamAppSchema.safeParse({}).success).toBe(false);
        expect(steamAppSchema.safeParse({ appid: 1 }).success).toBe(true);
    });
});

describe("playerAchievementSchema", () => {
    it("requires apiname", () => {
        expect(playerAchievementSchema.safeParse({ achieved: 1 }).success).toBe(false);
    });

    it("defaults achieved and unlocktime", () => {
        const result = playerAchievementSchema.safeParse({ apiname: "ACH" });

        expect(result.success && result.data).toMatchObject({ achieved: 0, unlocktime: 0 });
    });
});
