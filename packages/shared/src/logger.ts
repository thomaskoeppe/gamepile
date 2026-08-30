import { trace } from "@opentelemetry/api";

export interface LogContext {
    traceId?: string;
    spanId?: string;
    namespace?: string;
    [key: string]: unknown;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context: LogContext;
    error?: Error;
}

export interface ILogger {
    info(message: string, context?: LogContext): void;
    debug(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, error?: Error, context?: LogContext): void;
    child(namespace: string, baseContext?: LogContext): ILogger;
}

interface CreateLoggerOptions {
    exportLogEntry: (entry: LogEntry) => void;
    skipInBrowser?: boolean;
    mirrorToStdout?: boolean;
    /**
     * Minimum severity to emit. Entries below this level are dropped before any
     * export or stdout mirroring happens. Defaults to `LOG_LEVEL`, then `"info"`.
     */
    level?: LogLevel;
}

/** Severity ordering used for threshold comparisons. Higher is more severe. */
const LEVEL_SEVERITY: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const DEFAULT_LOG_LEVEL: LogLevel = "info";

/**
 * Parses a log level from an arbitrary value, falling back to {@link DEFAULT_LOG_LEVEL}
 * when the value is absent or is not a recognised level name.
 */
export function parseLogLevel(value: unknown, fallback: LogLevel = DEFAULT_LOG_LEVEL): LogLevel {
    if (typeof value !== "string") {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    return normalized in LEVEL_SEVERITY ? (normalized as LogLevel) : fallback;
}

/** Reads the configured minimum log level from `LOG_LEVEL`. */
function resolveConfiguredLevel(): LogLevel {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    return parseLogLevel(env?.LOG_LEVEL);
}

const MAX_CONSOLE_TEXT_LENGTH = 8_000;

export function sanitizeForConsole(value: string): string {
    return value
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/[\u001b\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "?")
        .slice(0, MAX_CONSOLE_TEXT_LENGTH);
}

export function safeStringify(value: unknown): string {
    try {
        return sanitizeForConsole(JSON.stringify(value));
    } catch {
        return "[unserializable-context]";
    }
}

function mirrorToConsole(entry: LogEntry): void {
    const contextSuffix = Object.keys(entry.context).length > 0 ? ` ${safeStringify(entry.context)}` : "";
    const errorSuffix = entry.error
        ? ` | ${sanitizeForConsole(entry.error.name)}: ${sanitizeForConsole(entry.error.message)}${entry.error.stack ? ` | ${sanitizeForConsole(entry.error.stack)}` : ""}`
        : "";
    const line = `[${sanitizeForConsole(entry.timestamp)}] ${sanitizeForConsole(entry.level.toUpperCase())} ${sanitizeForConsole(entry.message)}${contextSuffix}${errorSuffix}\n`;

    if (entry.level === "warn" || entry.level === "error") {
        process.stderr.write(line);
        return;
    }

    process.stdout.write(line);
}

class Logger implements ILogger {
    private readonly threshold: number;

    constructor(
        private readonly options: CreateLoggerOptions,
        private readonly baseContext: LogContext = {},
    ) {
        this.threshold = LEVEL_SEVERITY[options.level ?? resolveConfiguredLevel()];
    }

    private isEnabled(level: LogLevel): boolean {
        return LEVEL_SEVERITY[level] >= this.threshold;
    }

    private getTraceContext(): Pick<LogContext, "traceId" | "spanId"> {
        const span = trace.getActiveSpan();
        if (!span) return {};

        const { traceId, spanId } = span.spanContext();
        return { traceId, spanId };
    }

    private log(level: LogEntry["level"], message: string, context?: LogContext, error?: Error) {
        if (this.options.skipInBrowser && "window" in globalThis) {
            return;
        }

        if (!this.isEnabled(level)) {
            return;
        }

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context: {
                ...this.baseContext,
                ...this.getTraceContext(),
                ...context,
            },
            error,
        };

        this.options.exportLogEntry(entry);

        if (this.options.mirrorToStdout) {
            mirrorToConsole(entry);
        }
    }

    info(message: string, context?: LogContext) {
        this.log("info", message, context);
    }

    debug(message: string, context?: LogContext) {
        this.log("debug", message, context);
    }

    warn(message: string, context?: LogContext) {
        this.log("warn", message, context);
    }

    error(message: string, error?: Error, context?: LogContext) {
        this.log("error", message, context, error);
    }

    child(namespace: string, baseContext: LogContext = {}): ILogger {
        return new Logger(this.options, { ...this.baseContext, ...baseContext, namespace });
    }
}

export function createLogger(options: CreateLoggerOptions, baseContext?: LogContext): ILogger {
    return new Logger(options, baseContext);
}
