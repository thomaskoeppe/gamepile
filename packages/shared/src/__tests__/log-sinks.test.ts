/**
 * A logging destination must never be able to fail a request. These tests pin
 * the isolation guarantee that lets the web app fan out to OTLP and disk at once.
 */

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import type { LogEntry } from "../logger.js";
import { composeLogSinks, type LogSink } from "../log-sinks.js";

const entry: LogEntry = {
    timestamp: "2026-01-01T00:00:00.000Z",
    level: "info",
    message: "hello",
    context: {},
};

let stderrSpy: MockInstance<typeof process.stderr.write>;

beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(() => {
    stderrSpy.mockRestore();
});

function sink(name: string, overrides: Partial<LogSink> = {}): LogSink {
    return { name, exportLogEntry: vi.fn(), ...overrides };
}

describe("composeLogSinks", () => {
    it("forwards each entry to every sink", () => {
        const a = sink("a");
        const b = sink("b");

        composeLogSinks([a, b]).exportLogEntry(entry);

        expect(a.exportLogEntry).toHaveBeenCalledWith(entry);
        expect(b.exportLogEntry).toHaveBeenCalledWith(entry);
    });

    it("keeps delivering to healthy sinks when one throws", () => {
        const failing = sink("failing", {
            exportLogEntry: vi.fn(() => { throw new Error("disk full"); }),
        });
        const healthy = sink("healthy");

        const composite = composeLogSinks([failing, healthy]);

        // Must not propagate: this runs inside request handlers.
        expect(() => composite.exportLogEntry(entry)).not.toThrow();
        expect(healthy.exportLogEntry).toHaveBeenCalledWith(entry);
    });

    it("reports a failing sink to stderr without recursing into the logger", () => {
        const composite = composeLogSinks([
            sink("broken", { exportLogEntry: vi.fn(() => { throw new Error("nope"); }) }),
        ]);

        composite.exportLogEntry(entry);

        expect(stderrSpy).toHaveBeenCalledOnce();
        expect(String(stderrSpy.mock.calls[0][0])).toContain('sink "broken" failed during exportLogEntry');
    });

    it("isolates initialize failures", () => {
        const failing = sink("failing", { initialize: vi.fn(() => { throw new Error("bad path"); }) });
        const healthy = sink("healthy", { initialize: vi.fn() });

        const composite = composeLogSinks([failing, healthy]);

        expect(() => composite.initialize?.()).not.toThrow();
        expect(healthy.initialize).toHaveBeenCalled();
    });

    it("isolates shutdown failures and still awaits the rest", async () => {
        const failing = sink("failing", { shutdown: vi.fn().mockRejectedValue(new Error("flush failed")) });
        const healthy = sink("healthy", { shutdown: vi.fn().mockResolvedValue(undefined) });

        const composite = composeLogSinks([failing, healthy]);

        await expect(composite.shutdown?.()).resolves.toBeUndefined();
        expect(healthy.shutdown).toHaveBeenCalled();
    });

    it("tolerates sinks that implement no lifecycle hooks", async () => {
        const composite = composeLogSinks([sink("minimal")]);

        expect(() => composite.initialize?.()).not.toThrow();
        await expect(composite.shutdown?.()).resolves.toBeUndefined();
    });

    it("names itself after its members for diagnostics", () => {
        expect(composeLogSinks([sink("otlp"), sink("file")]).name).toBe("composite(otlp,file)");
    });
});
