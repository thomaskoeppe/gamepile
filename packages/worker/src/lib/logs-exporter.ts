/**
 * lib/logs-exporter.ts
 *
 * Initialises the OpenTelemetry LoggerProvider and wires it to an OTLP/HTTP
 * exporter.  Must only run on the Node.js server runtime – never in the
 * browser or the Edge runtime.
 *
 * Call initializeLogsExporter() once from instrumentation.ts.
 * Call exportLogEntry() from lib/logger.ts to emit individual records.
 *
 * Compatible package versions (pin these exactly):
 *   @opentelemetry/api                    1.9.0
 *   @opentelemetry/resources              2.2.0
 *   @opentelemetry/semantic-conventions   1.38.0
 *   @opentelemetry/api-logs               0.207.0
 *   @opentelemetry/sdk-logs               0.207.0
 *   @opentelemetry/exporter-logs-otlp-http 0.207.0
 */

import { context as otelContext } from '@opentelemetry/api';
import {AnyValue, type LogRecord, logs} from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { detectResources, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor,LoggerProvider } from '@opentelemetry/sdk-logs';
import {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

import type { LogEntry } from '@/src/lib/logger.js';

let isInitialized = false;
let loggerProvider: LoggerProvider | null = null;

const OTLP_BASE_URL =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

function buildLoggerProvider(): LoggerProvider {
    const detected = detectResources();
    const custom = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'gamepile-worker',
        [ATTR_SERVICE_VERSION]:
            process.env.npm_package_version ?? '0.0.0',
    });

    const resource = detected.merge(custom);

    const exporter = new OTLPLogExporter({
        url: `${OTLP_BASE_URL.replace(/\/$/, '')}/v1/logs`,
        headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
            ? Object.fromEntries(
                process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map((h) => {
                    const [k, ...v] = h.trim().split('=');
                    return [k, v.join('=')];
                }),
            )
            : undefined,
    });

    const processor = new BatchLogRecordProcessor(exporter, {
        maxExportBatchSize: 20,
        scheduledDelayMillis: 5_000,
        exportTimeoutMillis: 30_000,
        maxQueueSize: 1_000,
    });

    return new LoggerProvider({ resource, processors: [processor] });
}

/** Map text level names → OTel SeverityNumber constants. */
function toSeverityNumber(level: LogEntry['level']): number {
    switch (level) {
        case 'debug': return 5;
        case 'info':  return 9;
        case 'warn':  return 13;
        case 'error': return 17;
        default:      return 9;
    }
}

/**
 * Initialise the OTLP log exporter exactly once.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function initializeLogsExporter(): void {
    if (isInitialized) return;

    loggerProvider = buildLoggerProvider();
    logs.setGlobalLoggerProvider(loggerProvider);
    isInitialized = true;

    console.log('[otel] ✅ Logs exporter initialised →', OTLP_BASE_URL);
}

/**
 * Emit a single structured log record to the OTLP collector.
 * Called internally by lib/logger.ts.
 */
export function exportLogEntry(entry: LogEntry): void {
    if (!isInitialized) initializeLogsExporter();
    if (!loggerProvider) return;

    const otelLogger = loggerProvider.getLogger("gamepile-worker");

    const attributes: Record<string, AnyValue> = {
        ...entry.context,
        'log.level': entry.level,
        'service.name': "gamepile-worker",
    };

    if (entry.error) {
        attributes['error.name']    = entry.error.name;
        attributes['error.message'] = entry.error.message;
        attributes['error.stack']   = entry.error.stack;
    }

    const record: LogRecord = {
        body:               entry.message,
        timestamp:          Date.now(),
        observedTimestamp:  Date.now(),
        severityNumber:     toSeverityNumber(entry.level),
        severityText:       entry.level.toUpperCase(),
        attributes,
        context:           otelContext.active(),
    };

    otelLogger.emit(record);
}

/**
 * Gracefully flush pending batches and shut down the provider.
 * Call this in tests or custom server shutdown hooks.
 */
export function shutdownLogsExporter(): Promise<void> {
    return loggerProvider?.shutdown() ?? Promise.resolve();
}