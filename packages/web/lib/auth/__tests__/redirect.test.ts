/**
 * `sanitizePostAuthRedirect` is the open-redirect guard on the login flow: the
 * `?redirect=` parameter is attacker-controlled, so anything not on the
 * allow-list must fall back to the default landing page.
 */

import { describe, expect, it } from "vitest";

import { sanitizePostAuthRedirect } from "@/lib/auth/redirect";

const DEFAULT = "/library";

describe("allowed destinations", () => {
    it.each(["/", "/library", "/explore", "/collections", "/settings", "/vaults", "/admin"])(
        "permits %s",
        (path) => {
            expect(sanitizePostAuthRedirect(path)).toBe(path);
        },
    );

    it("permits nested paths under an allowed prefix", () => {
        expect(sanitizePostAuthRedirect("/vaults/abc123")).toBe("/vaults/abc123");
        expect(sanitizePostAuthRedirect("/admin/jobs/42")).toBe("/admin/jobs/42");
    });

    it("preserves the query string", () => {
        expect(sanitizePostAuthRedirect("/library?sort=name")).toBe("/library?sort=name");
    });
});

describe("rejected destinations", () => {
    it.each([
        ["a protocol-relative URL", "//evil.com"],
        ["a protocol-relative URL with a path", "//evil.com/phish"],
        ["an absolute http URL", "http://evil.com"],
        ["an absolute https URL", "https://evil.com/login"],
        ["a scheme-less host", "evil.com"],
        ["a javascript URL", "javascript:alert(1)"],
        ["a data URL", "data:text/html,<script>alert(1)</script>"],
        ["an unknown path", "/not-a-real-route"],
        ["a path that only prefixes an allowed one", "/librarian"],
    ])("falls back to the default for %s", (_label, input) => {
        expect(sanitizePostAuthRedirect(input)).toBe(DEFAULT);
    });

    it.each([null, undefined, ""])("falls back to the default for %s", (input) => {
        expect(sanitizePostAuthRedirect(input)).toBe(DEFAULT);
    });

    it("does not let a traversal escape the allow-list", () => {
        // Resolved by the URL parser before the prefix check runs.
        expect(sanitizePostAuthRedirect("/library/../../etc/passwd")).toBe(DEFAULT);
    });
});
