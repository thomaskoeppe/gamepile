/**
 * The three action clients every mutation is built on. `actionClientWithAdmin`
 * is the only thing standing between a normal user and admin-only mutations.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentSession, rateLimitAction } = vi.hoisted(() => ({
    getCurrentSession: vi.fn(),
    rateLimitAction: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentSession }));
vi.mock("@/lib/auth/rate-limit", () => ({ rateLimitAction, rateLimitPublic: vi.fn() }));

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
const ADMIN = { id: "a1", username: "admin", role: "ADMIN" };

beforeEach(() => {
    vi.resetModules();
    getCurrentSession.mockReset().mockResolvedValue({ user: USER, session: { id: "s1" } });
    rateLimitAction.mockReset().mockResolvedValue(null);
});

async function actions() {
    return import("@/server/actions");
}

describe("actionClientWithAuth", () => {
    it("runs the action for an authenticated caller", async () => {
        const { actionClientWithAuth } = await actions();
        const run = actionClientWithAuth.action(async () => "done");

        expect((await run()).data).toBe("done");
    });

    it("provides the user on the action context", async () => {
        const { actionClientWithAuth } = await actions();
        const handler = vi.fn().mockResolvedValue(null);

        await actionClientWithAuth.action(handler)();

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ ctx: { user: USER } }));
    });

    it("rejects an anonymous caller without running the action", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { actionClientWithAuth } = await actions();
        const handler = vi.fn();

        const result = await actionClientWithAuth.action(handler)();

        expect(result.serverError).toMatch(/Not authorized/);
        expect(handler).not.toHaveBeenCalled();
    });

    it("rejects when the session carries no user", async () => {
        getCurrentSession.mockResolvedValue({ session: { id: "s1" } });
        const { actionClientWithAuth } = await actions();

        expect((await actionClientWithAuth.action(vi.fn())()).serverError).toMatch(/Not authorized/);
    });

    it("rejects a rate-limited caller without running the action", async () => {
        rateLimitAction.mockResolvedValue({ success: false, message: "Too many requests." });
        const { actionClientWithAuth } = await actions();
        const handler = vi.fn();

        expect((await actionClientWithAuth.action(handler)()).serverError).toBe("Too many requests.");
        expect(handler).not.toHaveBeenCalled();
    });

    it("rate-limits per session rather than per IP", async () => {
        const { actionClientWithAuth } = await actions();

        await actionClientWithAuth.action(async () => null)();

        expect(rateLimitAction).toHaveBeenCalledWith(
            expect.objectContaining({ session: expect.objectContaining({ user: USER }) }),
        );
    });
});

describe("actionClientWithAdmin", () => {
    it("runs the action for an admin", async () => {
        getCurrentSession.mockResolvedValue({ user: ADMIN, session: { id: "s1" } });
        const { actionClientWithAdmin } = await actions();

        expect((await actionClientWithAdmin.action(async () => "ok")()).data).toBe("ok");
    });

    it("refuses a non-admin user", async () => {
        const { actionClientWithAdmin } = await actions();
        const handler = vi.fn();

        // Privilege escalation guard: a valid session is not enough.
        const result = await actionClientWithAdmin.action(handler)();

        expect(result.serverError).toMatch(/Forbidden/);
        expect(handler).not.toHaveBeenCalled();
    });

    it("refuses an anonymous caller", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { actionClientWithAdmin } = await actions();

        expect((await actionClientWithAdmin.action(vi.fn())()).serverError).toMatch(/Not authorized/);
    });

    it.each(["USER", "MODERATOR", "", "admin", "Admin"])("refuses the non-ADMIN role %s", async (role) => {
        getCurrentSession.mockResolvedValue({ user: { ...USER, role }, session: { id: "s1" } });
        const { actionClientWithAdmin } = await actions();
        const handler = vi.fn();

        // The check must be an exact match — a case variant is not admin.
        await actionClientWithAdmin.action(handler)();

        expect(handler).not.toHaveBeenCalled();
    });

    it("still rate-limits an admin once the role check passes", async () => {
        getCurrentSession.mockResolvedValue({ user: ADMIN, session: { id: "s1" } });
        rateLimitAction.mockResolvedValue({ success: false, message: "Too many requests." });
        const { actionClientWithAdmin } = await actions();
        const handler = vi.fn();

        // Admin is not exempt: an admin action loop can still hammer the database.
        expect((await actionClientWithAdmin.action(handler)()).serverError).toBe("Too many requests.");
        expect(handler).not.toHaveBeenCalled();
    });

    it("provides the admin user on the action context", async () => {
        getCurrentSession.mockResolvedValue({ user: ADMIN, session: { id: "s1" } });
        const { actionClientWithAdmin } = await actions();
        const handler = vi.fn().mockResolvedValue(null);

        await actionClientWithAdmin.action(handler)();

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ ctx: { user: ADMIN } }));
    });

    it("checks the role before spending a rate-limit token", async () => {
        const { actionClientWithAdmin } = await actions();

        await actionClientWithAdmin.action(vi.fn())();

        expect(rateLimitAction).not.toHaveBeenCalled();
    });
});

describe("actionClientWithoutAuth", () => {
    it("runs without a session", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { actionClientWithoutAuth } = await actions();

        expect((await actionClientWithoutAuth.action(async () => "public")()).data).toBe("public");
    });

    it("is still rate-limited", async () => {
        rateLimitAction.mockResolvedValue({ success: false, message: "Too many requests." });
        const { actionClientWithoutAuth } = await actions();
        const handler = vi.fn();

        expect((await actionClientWithoutAuth.action(handler)()).serverError).toBe("Too many requests.");
        expect(handler).not.toHaveBeenCalled();
    });

    it("rate-limits anonymously, with no session key", async () => {
        getCurrentSession.mockResolvedValue(null);
        const { actionClientWithoutAuth } = await actions();

        await actionClientWithoutAuth.action(async () => null)();

        expect(rateLimitAction).toHaveBeenCalledWith();
    });
});
