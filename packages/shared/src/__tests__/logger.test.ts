/**
 * `LOG_LEVEL` was set in every deployment manifest but consumed nowhere: the
 * logger exported every record regardless. With `proxy.ts` emitting several
 * debug entries per request, that meant unbounded log volume in production —
 * and, once file logging exists, an unbounded write rate to disk.
 */

import { describe, expect, it, vi } from "vitest";

import { createLogger, type LogEntry, parseLogLevel, safeStringify } from "../logger.js";

function collect(level?: "debug" | "info" | "warn" | "error") {
    const entries: LogEntry[] = [];
    const logger = createLogger({
        exportLogEntry: (entry) => entries.push(entry),
        level,
    });
    return { logger, entries };
}

describe("level filtering", () => {
    it("drops entries below the configured threshold", () => {
        const { logger, entries } = collect("warn");

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message", new Error("boom"));

        expect(entries.map((e) => e.level)).toEqual(["warn", "error"]);
    });

    it("emits everything at debug level", () => {
        const { logger, entries } = collect("debug");

        logger.debug("a");
        logger.info("b");
        logger.warn("c");
        logger.error("d", new Error("e"));

        expect(entries).toHaveLength(4);
    });

    it("does not call the exporter at all for filtered entries", () => {
        const exportLogEntry = vi.fn();
        const logger = createLogger({ exportLogEntry, level: "error" });

        logger.debug("dropped");
        logger.info("dropped");
        logger.warn("dropped");

        // The point of the threshold is to short-circuit before serialisation
        // and export, not merely to hide output.
        expect(exportLogEntry).not.toHaveBeenCalled();
    });

    it("falls back to info when LOG_LEVEL is unset", () => {
        vi.stubEnv("LOG_LEVEL", "");
        const { logger, entries } = collect();

        logger.debug("dropped");
        logger.info("kept");

        expect(entries.map((e) => e.message)).toEqual(["kept"]);
        vi.unstubAllEnvs();
    });

    it("reads the threshold from LOG_LEVEL when no level is passed", () => {
        vi.stubEnv("LOG_LEVEL", "error");
        const { logger, entries } = collect();

        logger.warn("dropped");
        logger.error("kept", new Error("boom"));

        expect(entries.map((e) => e.message)).toEqual(["kept"]);
        vi.unstubAllEnvs();
    });

    it("applies the threshold to child loggers", () => {
        const { logger, entries } = collect("warn");
        const child = logger.child("some.namespace");

        child.debug("dropped");
        child.warn("kept");

        expect(entries).toHaveLength(1);
        expect(entries[0].context.namespace).toBe("some.namespace");
    });
});

describe("parseLogLevel", () => {
    it.each([
        ["debug", "debug"],
        ["  WARN  ", "warn"],
        ["Error", "error"],
    ])("normalises %s to %s", (input, expected) => {
        expect(parseLogLevel(input)).toBe(expected);
    });

    it.each([undefined, null, "", "verbose", 42])("falls back to info for %s", (input) => {
        expect(parseLogLevel(input)).toBe("info");
    });

    it("honours an explicit fallback", () => {
        expect(parseLogLevel("nonsense", "error")).toBe("error");
    });
});

describe("entry construction", () => {
    it("merges base context, child context and call-site context", () => {
        const entries: LogEntry[] = [];
        const logger = createLogger(
            { exportLogEntry: (entry) => entries.push(entry), level: "debug" },
            { service: "web" },
        );

        logger.child("ns", { requestId: "req-1" }).info("hello", { userId: "u-1" });

        expect(entries[0].context).toMatchObject({
            service: "web",
            namespace: "ns",
            requestId: "req-1",
            userId: "u-1",
        });
    });

    it("carries the error object through on error()", () => {
        const { logger, entries } = collect("debug");
        const error = new Error("kaboom");

        logger.error("failed", error);

        expect(entries[0].error).toBe(error);
    });
});

describe("safeStringify", () => {
    it("strips control characters that could forge log lines", () => {
        const result = safeStringify({ message: "line1\nline2\rEVIL" });

        expect(result).not.toContain("\n");
        expect(result).not.toContain("\r");
    });

    it("returns a marker rather than throwing on circular input", () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        expect(safeStringify(circular)).toBe("[unserializable-context]");
    });
});
