import { trace } from "@opentelemetry/api";

export interface LogContext {
    traceId?: string;
    spanId?: string;
    namespace?: string;
    [key: string]: unknown;
}

export interface LogEntry {
    timestamp: string;
    level: "debug" | "info" | "warn" | "error";
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
}

const MAX_CONSOLE_TEXT_LENGTH = 8_000;

function sanitizeForConsole(value: string): string {
    return value
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/[\u001b\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "?")
        .slice(0, MAX_CONSOLE_TEXT_LENGTH);
}

function safeStringify(value: unknown): string {
    try {
        return sanitizeForConsole(JSON.stringify(value));
    } catch {
        return "[unserializable-context]";
    }
}

function mirrorToConsole(entry: LogEntry): void {
    const contextSuffix =
        Object.keys(entry.context).length > 0 ? ` ${safeStringify(entry.context)}` : "";
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
    constructor(
        private readonly options: CreateLoggerOptions,
        private readonly baseContext: LogContext = {},
    ) {}

    private getTraceContext(): Pick<LogContext, "traceId" | "spanId"> {
        const span = trace.getActiveSpan();
        if (!span) return {};

        const { traceId, spanId } = span.spanContext();
        return { traceId, spanId };
    }

    private log(
        level: LogEntry["level"],
        message: string,
        context?: LogContext,
        error?: Error,
    ) {
        if (this.options.skipInBrowser && "window" in globalThis) {
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


