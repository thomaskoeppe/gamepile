import { describe, expect, it } from "vitest";

import { getSlugError, isValidSlug, normalizeSlug, RESERVED_SLUGS, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from "@/lib/slug";

describe("normalizeSlug", () => {
    it("trims and lowercases", () => {
        expect(normalizeSlug("  My-Vault  ")).toBe("my-vault");
    });
});

describe("valid slugs", () => {
    it.each(["abc", "my-vault", "vault-123", "a1b2c3", "a".repeat(SLUG_MAX_LENGTH)])(
        "accepts %s",
        (slug) => {
            expect(isValidSlug(slug)).toBe(true);
            expect(getSlugError(slug)).toBeNull();
        },
    );
});

describe("invalid slugs", () => {
    it.each([
        ["too short", "ab"],
        ["too long", "a".repeat(SLUG_MAX_LENGTH + 1)],
        ["uppercase", "MyVault"],
        ["leading hyphen", "-vault"],
        ["trailing hyphen", "vault-"],
        ["double hyphen", "my--vault"],
        ["underscore", "my_vault"],
        ["space", "my vault"],
        ["slash", "my/vault"],
        ["empty", ""],
    ])("rejects %s", (_label, slug) => {
        expect(isValidSlug(slug)).toBe(false);
        expect(getSlugError(slug)).toBeTruthy();
    });

    it("rejects anything shaped like a cuid so slug-or-id lookup stays unambiguous", () => {
        const cuid = `c${"a".repeat(24)}`;

        expect(getSlugError(cuid)).toBe("That URL is not allowed.");
    });

    it.each([...RESERVED_SLUGS].filter((s) => s.length >= SLUG_MIN_LENGTH))(
        "reserves the route segment %s",
        (slug) => {
            expect(getSlugError(slug)).toBe("That URL is reserved.");
        },
    );

    it("reports the length rule before the character rule", () => {
        expect(getSlugError("A")).toContain("between");
    });
});
