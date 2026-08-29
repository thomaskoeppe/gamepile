/**
 * Every server action is wrapped in withLogging. If it swallowed errors,
 * next-safe-action would report success on a failed mutation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { childLogger, child } = vi.hoisted(() => {
    const childLogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
    return { childLogger, child: vi.fn(() => childLogger) };
});

vi.mock("@/lib/logger", () => ({ logger: { child } }));

beforeEach(() => {
    vi.resetModules();
    child.mockClear();
    Object.values(childLogger).forEach((fn) => fn.mockClear?.());
});

async function withLoggingModule() {
    return import("@/lib/with-logging");
}

const ARGS = { parsedInput: { name: "x" }, ctx: { user: { id: "u1" } } } as never;

describe("successful actions", () => {
    it("returns the handler result unchanged", async () => {
        const { withLogging } = await withLoggingModule();
        const wrapped = withLogging(async () => ({ ok: true }), { namespace: "ns:test" });

        expect(await wrapped(ARGS)).toEqual({ ok: true });
    });

    it("passes the action arguments through", async () => {
        const { withLogging } = await withLoggingModule();
        const handler = vi.fn().mockResolvedValue(null);

        await withLogging(handler, { namespace: "ns:test" })(ARGS);

        expect(handler).toHaveBeenCalledWith(ARGS, expect.objectContaining({ log: expect.anything() }));
    });

    it("hands the handler a namespaced logger", async () => {
        const { withLogging } = await withLoggingModule();

        await withLogging(
            async (_args, { log }) => {
                log.info("inside");
                return null;
            },
            { namespace: "server.actions.test:run" },
        )(ARGS);

        expect(child).toHaveBeenCalledWith("server.actions.test:run", undefined);
        expect(childLogger.info).toHaveBeenCalledWith("inside");
    });

    it("merges a base context into the child logger", async () => {
        const { withLogging } = await withLoggingModule();

        await withLogging(async () => null, {
            namespace: "ns:test",
            baseContext: { feature: "vaults" },
        })(ARGS);

        expect(child).toHaveBeenCalledWith("ns:test", { feature: "vaults" });
    });

    it("does not log an error on the happy path", async () => {
        const { withLogging } = await withLoggingModule();

        await withLogging(async () => null, { namespace: "ns:test" })(ARGS);

        expect(childLogger.error).not.toHaveBeenCalled();
    });
});

describe("failing actions", () => {
    it("re-throws so next-safe-action still sees the failure", async () => {
        const { withLogging } = await withLoggingModule();
        const boom = new Error("database unavailable");

        // Swallowing here would report a failed mutation as a success.
        await expect(
            withLogging(
                async () => {
                    throw boom;
                },
                { namespace: "ns:test" },
            )(ARGS),
        ).rejects.toThrow(boom);
    });

    it("logs the error with the namespace and the original Error object", async () => {
        const { withLogging } = await withLoggingModule();
        const boom = new Error("database unavailable");

        await expect(
            withLogging(
                async () => {
                    throw boom;
                },
                { namespace: "ns:test" },
            )(ARGS),
        ).rejects.toThrow();

        expect(childLogger.error).toHaveBeenCalledWith(expect.stringContaining("ns:test"), boom, expect.anything());
    });

    it("wraps a non-Error throw so the log always carries a stack", async () => {
        const { withLogging } = await withLoggingModule();

        await expect(
            withLogging(
                async () => {
                    throw "just a string";
                },
                { namespace: "ns:test" },
            )(ARGS),
        ).rejects.toBe("just a string");

        expect(childLogger.error.mock.calls[0][1]).toBeInstanceOf(Error);
    });
});
