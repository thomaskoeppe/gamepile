/**
 * log-sinks.ts
 *
 * Fan-out helper that lets a single logger feed several independent providers
 * (OTLP export, rotating file, ...) while guaranteeing that a failure in one
 * provider can never surface in a request path.
 *
 * `createLogger()` accepts exactly one `exportLogEntry` callback, so composing
 * providers happens here rather than by widening the logger's own contract.
 */

import type { LogEntry } from "./logger.js";

export interface LogSink {
    /** Stable identifier, used only for diagnostics when a sink misbehaves. */
    name: string;
    /** Emits a single record. Implementations must not throw. */
    exportLogEntry: (entry: LogEntry) => void;
    /** Optional eager initialisation hook, called once at startup. */
    initialize?: () => void;
    /** Optional flush/close hook, called on shutdown. */
    shutdown?: () => Promise<void>;
}

/**
 * Reports a sink failure without recursing back through the logger (which is
 * what is broken at this point) and without throwing.
 */
function reportSinkFailure(sinkName: string, stage: string, error: unknown): void {
    try {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        process.stderr.write(`[log-sinks] sink "${sinkName}" failed during ${stage}: ${message}\n`);
    } catch {
        // Nothing further we can do — never let diagnostics break the caller.
    }
}

/**
 * Combines several sinks into one. Each sink is isolated: if one throws during
 * `initialize`, `exportLogEntry`, or `shutdown`, the error is reported to stderr
 * and the remaining sinks still run.
 *
 * @param sinks - The providers to fan out to, in order.
 * @returns A single {@link LogSink} delegating to all of them.
 */
export function composeLogSinks(sinks: LogSink[]): LogSink {
    return {
        name: `composite(${sinks.map((sink) => sink.name).join(",")})`,

        initialize(): void {
            for (const sink of sinks) {
                try {
                    sink.initialize?.();
                } catch (error) {
                    reportSinkFailure(sink.name, "initialize", error);
                }
            }
        },

        exportLogEntry(entry: LogEntry): void {
            for (const sink of sinks) {
                try {
                    sink.exportLogEntry(entry);
                } catch (error) {
                    reportSinkFailure(sink.name, "exportLogEntry", error);
                }
            }
        },

        async shutdown(): Promise<void> {
            await Promise.all(
                sinks.map(async (sink) => {
                    try {
                        await sink.shutdown?.();
                    } catch (error) {
                        reportSinkFailure(sink.name, "shutdown", error);
                    }
                }),
            );
        },
    };
}
