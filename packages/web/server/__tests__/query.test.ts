/**
 * The wrapper every server query is built on: input validation, auth, rate
 * limiting and error containment. A hole here is a hole in every query at once.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { getCurrentSession, rateLimitAction, rateLimitPublic } = vi.hoisted(() => ({
    getCurrentSession: vi.fn(),
    rateLimitAction: vi.fn(),
    rateLimitPublic: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentSession }));
vi.mock("@/lib/auth/rate-limit", () => ({ rateLimitAction, rateLimitPublic }));

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

const USER = { id: "u1", username: "tester", role: "USER" };

beforeEach(() => {
    vi.resetModules();
    getCurrentSession.mockReset().mockResolvedValue({ user: USER, session: { id: "s1" } });
    rateLimitAction.mockReset().mockResolvedValue(null);
    rateLimitPublic.mockReset().mockResolvedValue(null);
});

async function query() {
    return import("@/server/query");
}

describe("queryClientWithAuth", () => {
    it("runs the handler for an authenticated caller", async () => {
        const { queryClientWithAuth } = await query();
        const run = queryClientWithAuth.query(async () => ({ value: 42 }));

        expect(await run()).toEqual({ success: true, data: { value: 42 } });
    });

    it("hands the handler the resolved user", async () => {
        const { queryClientWithAuth } = await query();
        const handler = vi.fn().mockResolvedValue(null);

        await queryClientWithAuth.query(handler)();

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ ctx: { user: USER } }));
    });

    it("refuses an anonymous caller without running the handler", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { queryClientWithAuth } = await query();
        const handler = vi.fn();

        // The authorization gate for every authenticated query.
        expect(await queryClientWithAuth.query(handler)()).toEqual({
            success: false,
            error: "Not authorized.",
        });
        expect(handler).not.toHaveBeenCalled();
    });

    it("refuses a session with no user attached", async () => {
        getCurrentSession.mockResolvedValue({ session: { id: "s1" } });
        const { queryClientWithAuth } = await query();

        expect(await queryClientWithAuth.query(vi.fn())()).toMatchObject({ success: false });
    });

    it("surfaces a rate-limit rejection without running the handler", async () => {
        rateLimitAction.mockResolvedValue({ success: false, message: "Too many requests." });
        const { queryClientWithAuth } = await query();
        const handler = vi.fn();

        expect(await queryClientWithAuth.query(handler)()).toEqual({
            success: false,
            error: "Too many requests.",
        });
        expect(handler).not.toHaveBeenCalled();
    });

    it("validates input before touching the handler", async () => {
        const { queryClientWithAuth } = await query();
        const handler = vi.fn();
        const run = queryClientWithAuth.inputSchema(z.object({ id: z.string() })).query(handler);

        const result = await run({ id: 42 } as never);

        expect(result.success).toBe(false);
        expect(handler).not.toHaveBeenCalled();
    });

    it("passes validated input through to the handler", async () => {
        const { queryClientWithAuth } = await query();
        const handler = vi.fn().mockResolvedValue("ok");
        const run = queryClientWithAuth.inputSchema(z.object({ id: z.string() })).query(handler);

        await run({ id: "abc" });

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ parsedInput: { id: "abc" } }));
    });

    it("checks authorization even when input validation would also fail", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { queryClientWithAuth } = await query();
        const handler = vi.fn();
        const run = queryClientWithAuth.inputSchema(z.object({ id: z.string() })).query(handler);

        expect((await run({ id: "abc" })).success).toBe(false);
        expect(handler).not.toHaveBeenCalled();
    });
});

describe("error containment", () => {
    it("converts a thrown handler error into a failed result", async () => {
        const { queryClientWithAuth } = await query();
        const run = queryClientWithAuth.query(async () => {
            throw new Error("connection pool timeout on host db-01");
        });

        const result = await run();

        expect(result.success).toBe(false);
    });

    it("does not leak internal error detail to the caller", async () => {
        const { queryClientWithAuth } = await query();
        const run = queryClientWithAuth.query(async () => {
            throw new Error("connection pool timeout on host db-01");
        });

        // Infrastructure detail must not reach the browser.
        expect(JSON.stringify(await run())).not.toContain("db-01");
    });

    it("contains a non-Error throw", async () => {
        const { queryClientWithAuth } = await query();
        const run = queryClientWithAuth.query(async () => {
            throw "a bare string";
        });

        expect((await run()).success).toBe(false);
    });
});

describe("queryClientWithAuth without an input schema", () => {
    it("resolves the session on the no-input variant too", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { queryClientWithAuth } = await query();
        const handler = vi.fn();

        expect(await queryClientWithAuth.query(handler)()).toMatchObject({ success: false });
        expect(handler).not.toHaveBeenCalled();
    });

    it("rate-limits the no-input variant too", async () => {
        rateLimitAction.mockResolvedValue({ success: false, message: "Too many requests." });
        const { queryClientWithAuth } = await query();
        const handler = vi.fn();

        expect(await queryClientWithAuth.query(handler)()).toMatchObject({ success: false });
        expect(handler).not.toHaveBeenCalled();
    });
});

describe("queryClientWithoutAuth", () => {
    it("runs the no-input variant with no session and no rate limit", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { queryClientWithoutAuth } = await query();

        expect(await queryClientWithoutAuth.query(async () => "public")()).toEqual({
            success: true,
            data: "public",
        });
    });

    it("contains an error thrown by the no-input variant", async () => {
        const { queryClientWithoutAuth } = await query();
        const run = queryClientWithoutAuth.query(async () => {
            throw new Error("upstream failure");
        });

        expect((await run()).success).toBe(false);
    });

    it("runs without a session", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { queryClientWithoutAuth } = await query();
        const run = queryClientWithoutAuth.inputSchema(z.object({ id: z.string() })).query(async () => ({ ok: true }));

        expect(await run({ id: "public" })).toEqual({ success: true, data: { ok: true } });
    });

    it("still rate-limits anonymous callers", async () => {
        rateLimitPublic.mockResolvedValue({ success: false, message: "Too many requests." });
        const { queryClientWithoutAuth } = await query();
        const handler = vi.fn();
        const run = queryClientWithoutAuth.inputSchema(z.object({ id: z.string() })).query(handler);

        // Public endpoints are the ones most worth throttling.
        expect(await run({ id: "x" })).toMatchObject({ success: false });
        expect(handler).not.toHaveBeenCalled();
    });

    it("still validates input", async () => {
        const { queryClientWithoutAuth } = await query();
        const run = queryClientWithoutAuth.inputSchema(z.object({ id: z.string() })).query(vi.fn());

        expect((await run({ id: 1 } as never)).success).toBe(false);
    });
});

describe("queryClientWithAdmin", () => {
    const ADMIN = { id: "a1", username: "admin", role: "ADMIN" };

    it("runs the query for an admin", async () => {
        getCurrentSession.mockResolvedValue({ user: ADMIN, session: { id: "s1" } });
        const { queryClientWithAdmin } = await query();

        expect(await queryClientWithAdmin.query(async () => "secret")()).toEqual({
            success: true,
            data: "secret",
        });
    });

    it("refuses a signed-in non-admin", async () => {
        const { queryClientWithAdmin } = await query();
        const handler = vi.fn();

        // Privilege escalation guard for the read side.
        expect(await queryClientWithAdmin.query(handler)()).toEqual({
            success: false,
            error: "Forbidden. Admin access is required.",
        });
        expect(handler).not.toHaveBeenCalled();
    });

    it("refuses an anonymous caller", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { queryClientWithAdmin } = await query();

        expect(await queryClientWithAdmin.query(vi.fn())()).toEqual({
            success: false,
            error: "Not authorized.",
        });
    });

    it.each(["USER", "admin", "Admin", "", "SUPERUSER"])("refuses the non-ADMIN role %s", async (role) => {
        getCurrentSession.mockResolvedValue({ user: { ...USER, role }, session: { id: "s1" } });
        const { queryClientWithAdmin } = await query();
        const handler = vi.fn();

        await queryClientWithAdmin.query(handler)();

        expect(handler).not.toHaveBeenCalled();
    });

    it("rate-limits an admin once the role check passes", async () => {
        getCurrentSession.mockResolvedValue({ user: ADMIN, session: { id: "s1" } });
        rateLimitAction.mockResolvedValue({ success: false, message: "Too many requests." });
        const { queryClientWithAdmin } = await query();
        const handler = vi.fn();

        expect(await queryClientWithAdmin.query(handler)()).toMatchObject({ success: false });
        expect(handler).not.toHaveBeenCalled();
    });

    it("applies the same guards on the input-schema variant", async () => {
        const { queryClientWithAdmin } = await query();
        const handler = vi.fn();
        const run = queryClientWithAdmin.inputSchema(z.object({ id: z.string() })).query(handler);

        expect(await run({ id: "x" })).toMatchObject({
            success: false,
            error: "Forbidden. Admin access is required.",
        });
        expect(handler).not.toHaveBeenCalled();
    });

    it("runs the input-schema variant for an admin with valid input", async () => {
        getCurrentSession.mockResolvedValue({ user: ADMIN, session: { id: "s1" } });
        const { queryClientWithAdmin } = await query();
        const run = queryClientWithAdmin
            .inputSchema(z.object({ id: z.string() }))
            .query(async ({ parsedInput }) => parsedInput.id);

        expect(await run({ id: "abc" })).toEqual({ success: true, data: "abc" });
    });

    it("rejects invalid input on the admin variant", async () => {
        getCurrentSession.mockResolvedValue({ user: ADMIN, session: { id: "s1" } });
        const { queryClientWithAdmin } = await query();
        const run = queryClientWithAdmin.inputSchema(z.object({ id: z.string() })).query(vi.fn());

        expect((await run({ id: 1 } as never)).success).toBe(false);
    });

    it("refuses an anonymous caller on the input-schema variant", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { queryClientWithAdmin } = await query();
        const run = queryClientWithAdmin.inputSchema(z.object({ id: z.string() })).query(vi.fn());

        expect(await run({ id: "x" })).toMatchObject({ error: "Not authorized." });
    });
});
