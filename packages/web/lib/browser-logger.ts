'use client';

/**
 * lib/browser-logger.ts
 *
 * Client-side logger that:
 *   • Buffers log entries in memory
 *   • Flushes them to /api/logs every 10 s (or on page hide / unload)
 *   • Attaches OTel traceId + spanId when a span is active
 *   • Auto-captures unhandled errors and promise rejections
 *
 * Import this only from Client Components:
 *   import { browserLog } from '@/lib/browser-logger'
 *   browserLog.info('Button clicked', { section: 'checkout' })
 */

import { trace } from '@opentelemetry/api';

import type { LogContext } from '@/lib/logger';

interface BrowserLogEntry {
    timestamp:  string
    level:      'debug' | 'info' | 'warn' | 'error'
    message:    string
    context:    LogContext
    error?: {
        name:     string
        message:  string
        stack?:   string
    }
}

class BrowserLogger {
    private buffer: BrowserLogEntry[] = [];
    private readonly flushIntervalMs  = 10_000;
    private readonly sessionId        = this.makeSessionId();

    constructor() {
        if (typeof window === 'undefined') return;

        this.hookGlobalErrors();

        setInterval(() => this.flush(), this.flushIntervalMs);

        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.flush();
        });
    }

    private makeSessionId(): string {
        return 'sess_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }

    private sanitizeConsoleMessage(value: string): string {
        return value
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n")
            .replace(/[\u001b\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "?")
            .slice(0, 4_000);
    }

    private mirrorDevConsole(level: BrowserLogEntry['level'], message: string, context: LogContext, error?: Error): void {
        const safeMessage = this.sanitizeConsoleMessage(message);

        switch (level) {
            case "error":
                console.error("%s", `[browser-log] ${safeMessage}`, context, error ?? "");
                break;
            case "warn":
                console.warn("%s", `[browser-log] ${safeMessage}`, context, error ?? "");
                break;
            case "debug":
                console.debug("%s", `[browser-log] ${safeMessage}`, context, error ?? "");
                break;
            default:
                console.info("%s", `[browser-log] ${safeMessage}`, context, error ?? "");
                break;
        }
    }

    /** Merge OTel span context + browser metadata into caller-supplied fields. */
    private enrich(context: LogContext = {}): LogContext {
        const span = trace.getActiveSpan();
        const ctx  = span?.spanContext();
        return {
            traceId:   ctx?.traceId ?? 'no-trace',
            spanId:    ctx?.spanId  ?? 'no-span',
            sessionId: this.sessionId,
            url:       typeof window !== 'undefined' ? window.location.href : undefined,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            ...context,
        };
    }

    private record(
        level: BrowserLogEntry['level'],
        message: string,
        context?: LogContext,
        error?: Error,
    ) {
        if (typeof window === 'undefined') return;

        const entry: BrowserLogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            context: this.enrich(context),
        };

        if (error) {
            entry.error = { name: error.name, message: error.message, stack: error.stack };
        }

        if (process.env.NODE_ENV === 'development') {
            this.mirrorDevConsole(level, message, entry.context, error);
        }

        this.buffer.push(entry);
    }

    /**
     * Ship buffered entries to /api/logs.
     * Uses sendBeacon when available so logs survive navigation away.
     */
    private flush(): void {
        if (typeof window === 'undefined' || this.buffer.length === 0) return;

        const payload = this.buffer.splice(0);

        try {
            const body = JSON.stringify(payload);

            if (navigator.sendBeacon) {
                const sent = navigator.sendBeacon('/api/logs', new Blob([body], { type: 'application/json' }));
                if (!sent) {
                    this.fetchFallback(body, payload);
                }
            } else {
                this.fetchFallback(body, payload);
            }
        } catch (err) {
            console.error('[browser-log] flush error', err);
            this.buffer.unshift(...payload);
        }
    }

    private fetchFallback(body: string, entries: BrowserLogEntry[]): void {
        fetch('/api/logs', {
            method:    'POST',
            headers:   { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
        }).catch((err) => {
            console.error('[browser-log] fetch error', err);
            this.buffer.unshift(...entries);
        });
    }

    /**
     * Register window-level error handlers so uncaught exceptions and rejected
     * promises are automatically captured without any call-site changes.
     */
    private hookGlobalErrors(): void {
        window.onerror = (msg, src, line, col, error) => {
            this.record('error', `Unhandled error: ${msg}`, {
                source:     'window.onerror',
                sourceFile: src,
                line,
                col,
            }, error ?? new Error(String(msg)));
        };

        window.onunhandledrejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason;
            const err    = reason instanceof Error ? reason : new Error(String(reason));
            this.record('error', 'Unhandled promise rejection', { source: 'window.onunhandledrejection' }, err);
        };
    }

    info(message: string, context?: LogContext) {
        this.record('info', message, context);
    }

    debug(message: string, context?: LogContext) {
        this.record('debug', message, context);
    }

    warn(message: string, context?: LogContext) {
        this.record('warn', message, context);
    }

    error(message: string, error: Error, context?: LogContext) {
        this.record('error', message, context, error);
    }

    /** Manually trigger a flush (useful in E2E tests or before critical navigations). */
    forceFlush() {
        this.flush();
    }
}

export const browserLog = new BrowserLogger();