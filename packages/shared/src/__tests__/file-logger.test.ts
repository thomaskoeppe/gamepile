/**
 * Exercises the rotating file sink against a real temp directory — no `fs`
 * mocking, so rotation, retention and compression are genuinely verified.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFileLogger, fileLoggerOptionsFromEnv } from "../file-logger.js";
import type { LogEntry } from "../logger.js";

let dir: string;

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
    return {
        timestamp: "2026-01-01T00:00:00.000Z",
        level: "info",
        message: "hello world",
        context: { namespace: "test.ns" },
        ...overrides,
    };
}

/** Waits for the stream to flush its buffered writes to disk. */
async function flushed(logger: { shutdownFileLogger: () => Promise<void> }): Promise<void> {
    await logger.shutdownFileLogger();
}

function readLogFile(fileName = "svc.log"): string {
    return readFileSync(join(dir, fileName), "utf8");
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gamepile-logs-"));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
});

describe("writing", () => {
    it("writes one parsable JSON record per entry", async () => {
        const logger = createFileLogger({
            serviceName: "svc",
            enabled: true,
            dir,
            fileName: "svc.log",
            compress: false,
        });

        logger.initializeFileLogger();
        logger.exportLogEntry(makeEntry({ message: "first" }));
        logger.exportLogEntry(makeEntry({ message: "second", level: "warn" }));
        await flushed(logger);

        const lines = readLogFile().trim().split("\n");
        expect(lines).toHaveLength(2);

        const first = JSON.parse(lines[0]);
        expect(first).toMatchObject({
            level: "info",
            service: "svc",
            message: "first",
            namespace: "test.ns",
        });
        expect(JSON.parse(lines[1]).level).toBe("warn");
    });

    it("serialises errors with name, message and stack", async () => {
        const logger = createFileLogger({ serviceName: "svc", enabled: true, dir, fileName: "svc.log", compress: false });
        const error = new Error("boom");

        logger.initializeFileLogger();
        logger.exportLogEntry(makeEntry({ level: "error", error }));
        await flushed(logger);

        const record = JSON.parse(readLogFile().trim());
        expect(record.error).toMatchObject({ name: "Error", message: "boom" });
        expect(record.error.stack).toContain("Error: boom");
    });

    it("keeps one record on one line even when the message contains newlines", async () => {
        const logger = createFileLogger({ serviceName: "svc", enabled: true, dir, fileName: "svc.log", compress: false });

        logger.initializeFileLogger();
        logger.exportLogEntry(makeEntry({ message: "line1\nline2\rinjected" }));
        await flushed(logger);

        // A forged newline would otherwise let a log message fabricate records.
        expect(readLogFile().trim().split("\n")).toHaveLength(1);
    });

    it("writes human-readable lines in text format", async () => {
        const logger = createFileLogger({
            serviceName: "svc", enabled: true, dir, fileName: "svc.log", compress: false, format: "text",
        });

        logger.initializeFileLogger();
        logger.exportLogEntry(makeEntry({ message: "readable" }));
        await flushed(logger);

        const line = readLogFile().trim();
        expect(line).toContain("INFO");
        expect(line).toContain("svc");
        expect(line).toContain("readable");
    });

    it("creates the log directory when it does not exist yet", async () => {
        const nested = join(dir, "deeply", "nested");
        const logger = createFileLogger({ serviceName: "svc", enabled: true, dir: nested, fileName: "svc.log", compress: false });

        logger.initializeFileLogger();
        logger.exportLogEntry(makeEntry());
        await flushed(logger);

        expect(readdirSync(nested)).toContain("svc.log");
    });
});

describe("rotation and retention", () => {
    it("rotates once the size limit is exceeded and prunes beyond maxFiles", async () => {
        const logger = createFileLogger({
            serviceName: "svc",
            enabled: true,
            dir,
            fileName: "svc.log",
            maxSize: "1B",
            maxFiles: 2,
            compress: false,
        });

        logger.initializeFileLogger();
        for (let i = 0; i < 6; i++) {
            logger.exportLogEntry(makeEntry({ message: `entry-${i}` }));
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await flushed(logger);

        const rotated = readdirSync(dir).filter((f) => f !== "svc.log" && !f.endsWith(".txt"));

        expect(rotated.length).toBeGreaterThan(0);
        // Retention must bound disk usage, or file logging becomes an outage.
        expect(rotated.length).toBeLessThanOrEqual(2);
    });

    it("compresses rotated files when compression is enabled", async () => {
        const logger = createFileLogger({
            serviceName: "svc", enabled: true, dir, fileName: "svc.log", maxSize: "1B", maxFiles: 3, compress: "gzip",
        });

        logger.initializeFileLogger();
        for (let i = 0; i < 4; i++) {
            logger.exportLogEntry(makeEntry({ message: `entry-${i}` }));
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await flushed(logger);

        expect(readdirSync(dir).some((f) => f.endsWith(".gz"))).toBe(true);
    });
});

describe("fail-soft behaviour", () => {
    it("stays disabled when the sink is not enabled", () => {
        const logger = createFileLogger({ serviceName: "svc", enabled: false, dir, fileName: "svc.log" });

        logger.initializeFileLogger();
        logger.exportLogEntry(makeEntry());

        expect(logger.isActive).toBe(false);
        expect(readdirSync(dir)).toHaveLength(0);
    });

    it("disables itself instead of throwing when the directory cannot be created", () => {
        // A file where the directory should be makes mkdir fail.
        const blocked = join(dir, "blocker");
        writeFileSync(blocked, "not a directory");
        const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

        const logger = createFileLogger({
            serviceName: "svc", enabled: true, dir: join(blocked, "logs"), fileName: "svc.log",
        });

        expect(() => logger.initializeFileLogger()).not.toThrow();
        // This is the crucial guarantee: a bad log path must not 500 requests.
        expect(() => logger.exportLogEntry(makeEntry())).not.toThrow();
        expect(logger.isActive).toBe(false);
        expect(String(stderr.mock.calls[0][0])).toContain("[file-logger] disabled");

        stderr.mockRestore();
    });

    it("resolves shutdown even when nothing was ever written", async () => {
        const logger = createFileLogger({ serviceName: "svc", enabled: false, dir, fileName: "svc.log" });

        await expect(logger.shutdownFileLogger()).resolves.toBeUndefined();
    });

    it("exposes a LogSink adapter wired to the same stream", async () => {
        const logger = createFileLogger({ serviceName: "svc", enabled: true, dir, fileName: "svc.log", compress: false });
        const sink = logger.toLogSink();

        expect(sink.name).toBe("file");
        sink.initialize?.();
        sink.exportLogEntry(makeEntry({ message: "via sink" }));
        await sink.shutdown?.();

        expect(readLogFile()).toContain("via sink");
    });
});

describe("fileLoggerOptionsFromEnv", () => {
    it("is disabled by default", () => {
        expect(fileLoggerOptionsFromEnv("svc", {}).enabled).toBe(false);
    });

    it("reads every supported variable", () => {
        const options = fileLoggerOptionsFromEnv("svc", {
            LOG_FILE_ENABLED: "true",
            LOG_FILE_DIR: "/var/log/app",
            LOG_FILE_NAME: "custom.log",
            LOG_FILE_MAX_SIZE: "5M",
            LOG_FILE_MAX_FILES: "7",
            LOG_FILE_INTERVAL: "12h",
            LOG_FILE_COMPRESS: "gzip",
            LOG_FILE_FORMAT: "text",
        });

        expect(options).toMatchObject({
            enabled: true,
            dir: "/var/log/app",
            fileName: "custom.log",
            maxSize: "5M",
            maxFiles: 7,
            interval: "12h",
            compress: "gzip",
            format: "text",
        });
    });

    it("defaults the filename to the service name so services never share a file", () => {
        expect(fileLoggerOptionsFromEnv("gamepile-worker", {}).fileName).toBe("gamepile-worker.log");
    });

    it.each(["false", "none", "off", "0", "bogus"])("treats compress=%s as disabled", (value) => {
        expect(fileLoggerOptionsFromEnv("svc", { LOG_FILE_COMPRESS: value }).compress).toBe(false);
    });

    it.each([
        ["1", true], ["true", true], ["yes", true], ["on", true],
        ["0", false], ["false", false], ["no", false], ["off", false],
    ])("parses LOG_FILE_ENABLED=%s as %s", (value, expected) => {
        expect(fileLoggerOptionsFromEnv("svc", { LOG_FILE_ENABLED: value }).enabled).toBe(expected);
    });

    it("ignores a non-numeric maxFiles rather than producing NaN", () => {
        expect(fileLoggerOptionsFromEnv("svc", { LOG_FILE_MAX_FILES: "many" }).maxFiles).toBe(14);
    });
});
