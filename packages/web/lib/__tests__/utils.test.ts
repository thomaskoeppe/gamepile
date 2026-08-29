import { describe, expect, it } from "vitest";

import { cn, formatDurationMs, formatMinutesToHoursMinutes, parseClampedInt } from "@/lib/utils";

describe("cn", () => {
    it("merges conflicting tailwind classes, last one winning", () => {
        expect(cn("p-2", "p-4")).toBe("p-4");
    });

    it("drops falsy values", () => {
        expect(cn("a", false, null, undefined, "b")).toBe("a b");
    });
});

describe("parseClampedInt", () => {
    it("parses a valid value", () => {
        expect(parseClampedInt("5", { fallback: 1, min: 1, max: 10 })).toBe(5);
    });

    it.each([null, "", "abc", "NaN"])("falls back for malformed input %s", (raw) => {
        // Malformed pagination input must never reach a database query as NaN.
        expect(parseClampedInt(raw, { fallback: 1, min: 1, max: 10 })).toBe(1);
    });

    it("clamps to the bounds", () => {
        expect(parseClampedInt("-5", { fallback: 1, min: 1, max: 10 })).toBe(1);
        expect(parseClampedInt("999", { fallback: 1, min: 1, max: 10 })).toBe(10);
    });

    it("leaves the value unbounded above when no max is given", () => {
        expect(parseClampedInt("999", { fallback: 1, min: 1 })).toBe(999);
    });

    it("parses a leading integer from mixed input", () => {
        expect(parseClampedInt("12abc", { fallback: 1, min: 1, max: 100 })).toBe(12);
    });
});

describe("formatMinutesToHoursMinutes", () => {
    it.each([
        [0, "Never"],
        [30, "30m"],
        [60, "1h"],
        [90, "1h 30m"],
        [1_440, "1d"],
        [1_530, "1d 1h 30m"],
    ])("formats %i minutes as %s", (input, expected) => {
        expect(formatMinutesToHoursMinutes(input)).toBe(expected);
    });
});

describe("formatDurationMs", () => {
    it.each([
        [0, "0s"],
        [1_500, "1s"],
        [65_000, "1m 5s"],
        [3_665_000, "1h 1m 5s"],
    ])("formats %ims as %s", (input, expected) => {
        expect(formatDurationMs(input)).toBe(expected);
    });

    it("floors negative durations to zero", () => {
        expect(formatDurationMs(-5_000)).toBe("0s");
    });
});
