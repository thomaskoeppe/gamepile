/**
 * file-logger.ts
 *
 * Rotating on-disk log provider. Mirrors the shape of `logs-exporter.ts`
 * (`initialize* / exportLogEntry / shutdown*`) so both providers can be composed
 * with `composeLogSinks()` and wired identically from web and worker startup.
 *
 * Design rule: this provider must never be able to take the application down.
 * An unwritable directory, a full disk, or a stream error disables the sink and
 * leaves the process serving. `exportLogEntry` never throws.
 */

import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { createStream, type RotatingFileStream } from "rotating-file-stream";

import { type LogEntry, safeStringify, sanitizeForConsole } from "./logger.js";
import type { LogSink } from "./log-sinks.js";

export type FileLogFormat = "json" | "text";

/** Compression modes accepted by `rotating-file-stream` for rotated files. */
export type FileLogCompression = "gzip" | false;

export interface CreateFileLoggerOptions {
    /** Used for the default filename so web and worker never share a file. */
    serviceName: string;
    enabled?: boolean;
    dir?: string;
    fileName?: string;
    /** Rotate once the active file exceeds this size, e.g. `"10M"`. */
    maxSize?: string;
    /** Number of rotated files to retain before the oldest is pruned. */
    maxFiles?: number;
    /** Also rotate on a fixed interval, e.g. `"1d"`. */
    interval?: string;
    /** Compression for rotated files; `false` disables it. */
    compress?: FileLogCompression;
    format?: FileLogFormat;
    skipInBrowser?: boolean;
}

export interface FileLoggerEnvVars {
    LOG_FILE_ENABLED?: string;
    LOG_FILE_DIR?: string;
    LOG_FILE_NAME?: string;
    LOG_FILE_MAX_SIZE?: string;
    LOG_FILE_MAX_FILES?: string;
    LOG_FILE_INTERVAL?: string;
    LOG_FILE_COMPRESS?: string;
    LOG_FILE_FORMAT?: string;
}

const DEFAULTS = {
    dir: "./logs",
    maxSize: "10M",
    maxFiles: 14,
    interval: "1d",
    compress: "gzip" as FileLogCompression,
    format: "json" as FileLogFormat,
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Builds file-logger options from environment variables, so web and worker
 * resolve configuration identically.
 *
 * @param serviceName - Service identifier used for the default log filename.
 * @param env - Environment source; defaults to `process.env`.
 */
export function fileLoggerOptionsFromEnv(
    serviceName: string,
    env?: FileLoggerEnvVars,
): CreateFileLoggerOptions {
    const resolvedEnv =
        env ?? (globalThis as { process?: { env?: FileLoggerEnvVars } }).process?.env ?? {};

    const compressRaw = resolvedEnv.LOG_FILE_COMPRESS?.trim().toLowerCase();

    return {
        serviceName,
        enabled: parseBoolean(resolvedEnv.LOG_FILE_ENABLED, false),
        dir: resolvedEnv.LOG_FILE_DIR?.trim() || DEFAULTS.dir,
        fileName: resolvedEnv.LOG_FILE_NAME?.trim() || `${serviceName}.log`,
        maxSize: resolvedEnv.LOG_FILE_MAX_SIZE?.trim() || DEFAULTS.maxSize,
        maxFiles: parsePositiveInt(resolvedEnv.LOG_FILE_MAX_FILES, DEFAULTS.maxFiles),
        interval: resolvedEnv.LOG_FILE_INTERVAL?.trim() || DEFAULTS.interval,
        // rotating-file-stream only understands "gzip" or a custom compressor
        // function; anything else is treated as "disabled" rather than passed
        // through, so a typo cannot crash the stream on first rotation.
        compress:
            compressRaw === undefined || compressRaw === ""
                ? DEFAULTS.compress
                : compressRaw === "gzip"
                  ? "gzip"
                  : false,
        format: resolvedEnv.LOG_FILE_FORMAT?.trim().toLowerCase() === "text" ? "text" : DEFAULTS.format,
    };
}

/** Serialises an entry as a single newline-delimited JSON record. */
function formatJsonLine(entry: LogEntry, serviceName: string): string {
    const payload: Record<string, unknown> = {
        timestamp: entry.timestamp,
        level: entry.level,
        service: serviceName,
        message: entry.message,
        ...entry.context,
    };

    if (entry.error) {
        payload.error = {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack,
        };
    }

    // safeStringify also strips control characters, so a crafted log message
    // cannot inject extra lines into the file.
    return `${safeStringify(payload)}\n`;
}

/** Serialises an entry in the same human-readable shape used for stdout. */
function formatTextLine(entry: LogEntry, serviceName: string): string {
    const contextSuffix =
        Object.keys(entry.context).length > 0 ? ` ${safeStringify(entry.context)}` : "";
    const errorSuffix = entry.error
        ? ` | ${sanitizeForConsole(entry.error.name)}: ${sanitizeForConsole(entry.error.message)}`
        : "";

    return (
        `[${sanitizeForConsole(entry.timestamp)}] ${entry.level.toUpperCase()} ` +
        `${sanitizeForConsole(serviceName)} ${sanitizeForConsole(entry.message)}` +
        `${contextSuffix}${errorSuffix}\n`
    );
}

export function createFileLogger(options: CreateFileLoggerOptions) {
    const enabled = options.enabled ?? false;
    const format = options.format ?? DEFAULTS.format;
    const dir = options.dir ?? DEFAULTS.dir;
    const fileName = options.fileName ?? `${options.serviceName}.log`;

    let stream: RotatingFileStream | null = null;
    let isInitialized = false;
    /** Flipped on any unrecoverable failure; the sink then quietly no-ops. */
    let disabled = !enabled;

    function disable(reason: string, error?: unknown): void {
        if (disabled) return;
        disabled = true;

        try {
            const detail = error instanceof Error ? ` (${error.name}: ${error.message})` : "";
            process.stderr.write(
                `[file-logger] disabled — ${reason}${detail}. Application logging continues via other sinks.\n`,
            );
        } catch {
            // Diagnostics are best-effort.
        }

        try {
            stream?.destroy();
        } catch {
            // Already broken; nothing to salvage.
        }
        stream = null;
    }

    function initializeFileLogger(): void {
        if (options.skipInBrowser && "window" in globalThis) return;
        if (isInitialized || disabled) return;

        isInitialized = true;

        const absoluteDir = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);

        try {
            mkdirSync(absoluteDir, { recursive: true });
        } catch (error) {
            disable(`log directory "${absoluteDir}" is not creatable`, error);
            return;
        }

        try {
            stream = createStream(fileName, {
                path: absoluteDir,
                size: options.maxSize ?? DEFAULTS.maxSize,
                interval: options.interval ?? DEFAULTS.interval,
                maxFiles: options.maxFiles ?? DEFAULTS.maxFiles,
                ...(options.compress === false ? {} : { compress: options.compress ?? DEFAULTS.compress }),
            });
        } catch (error) {
            disable(`could not open log file in "${absoluteDir}"`, error);
            return;
        }

        // An unhandled 'error' event on a stream terminates the process. Since a
        // logging fault must never do that, every failure disables the sink instead.
        stream.on("error", (error) => disable("write stream error", error));

        if (process.env.NODE_ENV !== "test") {
            process.stdout.write(`[file-logger] writing to ${absoluteDir}/${fileName}\n`);
        }
    }

    function exportLogEntry(entry: LogEntry): void {
        if (options.skipInBrowser && "window" in globalThis) return;
        if (disabled) return;
        if (!isInitialized) initializeFileLogger();
        if (!stream || stream.destroyed) return;

        try {
            stream.write(format === "text" ? formatTextLine(entry, options.serviceName) : formatJsonLine(entry, options.serviceName));
        } catch (error) {
            disable("write failed", error);
        }
    }

    function shutdownFileLogger(): Promise<void> {
        const active = stream;
        stream = null;

        if (!active || active.destroyed) {
            return Promise.resolve();
        }

        return new Promise<void>((resolvePromise) => {
            // Resolve on either outcome — shutdown must not hang or reject.
            active.end(() => resolvePromise());
            active.once("error", () => resolvePromise());
        });
    }

    /** Adapts this provider to the {@link LogSink} interface for `composeLogSinks`. */
    function toLogSink(): LogSink {
        return {
            name: "file",
            initialize: initializeFileLogger,
            exportLogEntry,
            shutdown: shutdownFileLogger,
        };
    }

    return {
        initializeFileLogger,
        exportLogEntry,
        shutdownFileLogger,
        toLogSink,
        /** True when the sink is configured and has not failed. */
        get isActive(): boolean {
            return !disabled;
        },
    };
}
