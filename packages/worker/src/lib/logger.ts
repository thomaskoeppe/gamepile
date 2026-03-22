/**
 * lib/logger.ts
 *
 * Primary server-side logger. Automatically attaches traceId + spanId from
 * the active OpenTelemetry span and forwards structured log records to the
 * OTLP exporter (lib/logs-exporter.ts).
 *
 * Usage (server components, route handlers, server actions):
 *   import { logger } from '@/lib/logger'
 *   logger.info('User signed in', { userId: '123' })
 *   logger.error('DB query failed', err, { query: 'SELECT ...' })
 *
 *   // Namespaced child logger — all records carry { namespace }
 *   const log = logger.child('server.actions.admin:saveConfiguration')
 *   log.info('Saving config', { userId })
 */

import { trace } from '@opentelemetry/api';

import {exportLogEntry, shutdownLogsExporter} from '@/src/lib/logs-exporter.js';

export interface LogContext {
    traceId?:   string
    spanId?:    string
    namespace?: string
    [key: string]: unknown
}

export interface LogEntry {
    timestamp: string
    level: 'debug' | 'info' | 'warn' | 'error'
    message: string
    context: LogContext
    error?: Error
}

/** Public interface so withLogging (and tests) can type the injected logger. */
export interface ILogger {
    info  (message: string, context?: LogContext): void
    debug (message: string, context?: LogContext): void
    warn  (message: string, context?: LogContext): void
    error (message: string, error?: Error, context?: LogContext): void
    /** Create a child logger that stamps every record with { namespace }. */
    child (namespace: string, baseContext?: LogContext): ILogger
}

class Logger implements ILogger {
    /**
     * @param baseContext  Fields merged into every log record produced by this
     *                     instance (e.g. { namespace, userId }).
     */
    constructor(private readonly baseContext: LogContext = {}) {}


    /** Pull traceId + spanId from the currently active OTel span (if any). */
    private getTraceContext(): Pick<LogContext, 'traceId' | 'spanId'> {
        const span = trace.getActiveSpan();
        if (!span) return {};
        const { traceId, spanId } = span.spanContext();
        return { traceId, spanId };
    }

    private log(
        level: LogEntry['level'],
        message: string,
        context?: LogContext,
        error?: Error,
    ) {
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

        exportLogEntry(entry);

        const meta = { ...entry.context };
        if (error) meta['error'] = { name: error.name, message: error.message };

        const line = `[${entry.timestamp}] ${level.toUpperCase().padEnd(5)} ${message}`;
        if (level === 'error' || level === 'warn') {
            console.error(line, Object.keys(meta).length ? meta : '');
        } else {
            console.log(line, Object.keys(meta).length ? meta : '');
        }
    }


    info(message: string, context?: LogContext) {
        this.log('info', message, context);
    }

    debug(message: string, context?: LogContext) {
        this.log('debug', message, context);
    }

    warn(message: string, context?: LogContext) {
        this.log('warn', message, context);
    }

    /**
     * @param message  Human-readable description of what went wrong.
     * @param error    The Error instance (captures name, message, stack).
     * @param context  Any extra structured fields (userId, orderId, …).
     */
    error(message: string, error?: Error, context?: LogContext) {
        this.log('error', message, context, error);
    }

    /**
     * Return a new Logger that stamps every record with `{ namespace, ...baseContext }`.
     * The child inherits the parent's baseContext and can be further nested.
     *
     * @example
     *   const log = logger.child('server.actions.admin:saveConfiguration')
     *   log.info('Starting')  // → { namespace: 'server.actions.admin:saveConfiguration', … }
     */
    child(namespace: string, baseContext: LogContext = {}): Logger {
        return new Logger({ ...this.baseContext, ...baseContext, namespace });
    }
}

export const logger = new Logger();

export function flushLogs(): Promise<void> {
    return shutdownLogsExporter();
}