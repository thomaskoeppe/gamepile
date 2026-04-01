import { context as otelContext } from "@opentelemetry/api";
import { type AnyValue, type LogRecord, logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { detectResources, resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

import type { LogEntry } from "./logger.js";

interface CreateLogsExporterOptions {
    serviceName: string;
    serviceVersion?: string;
    otlpBaseUrl?: string;
    skipInBrowser?: boolean;
}

function toSeverityNumber(level: LogEntry["level"]): number {
    switch (level) {
        case "debug":
            return 5;
        case "info":
            return 9;
        case "warn":
            return 13;
        case "error":
            return 17;
        default:
            return 9;
    }
}

export function createLogsExporter(options: CreateLogsExporterOptions) {
    let isInitialized = false;
    let loggerProvider: LoggerProvider | null = null;

    const otlpBaseUrl =
        options.otlpBaseUrl ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

    function initializeLogsExporter(): void {
        if (options.skipInBrowser && "window" in globalThis) return;
        if (isInitialized) return;

        const detected = detectResources();
        const custom = resourceFromAttributes({
            [ATTR_SERVICE_NAME]: options.serviceName,
            [ATTR_SERVICE_VERSION]: options.serviceVersion ?? process.env.npm_package_version ?? "0.0.0",
        });

        const resource = detected.merge(custom);
        const exporter = new OTLPLogExporter({
            url: `${otlpBaseUrl.replace(/\/$/, "")}/v1/logs`,
            headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
                ? Object.fromEntries(
                      process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",").map((headerValue) => {
                          const [key, ...rest] = headerValue.trim().split("=");
                          return [key, rest.join("=")];
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

        loggerProvider = new LoggerProvider({ resource, processors: [processor] });
        logs.setGlobalLoggerProvider(loggerProvider);
        isInitialized = true;

        if (process.env.NODE_ENV !== "production") {
            process.stdout.write(`[otel] Logs exporter initialised -> ${otlpBaseUrl}\n`);
        }
    }

    function exportLogEntry(entry: LogEntry): void {
        if (options.skipInBrowser && "window" in globalThis) return;
        if (!isInitialized) initializeLogsExporter();
        if (!loggerProvider) return;

        const otelLogger = loggerProvider.getLogger(options.serviceName);
        const attributes: Record<string, AnyValue> = {
            ...entry.context,
            "log.level": entry.level,
            "service.name": options.serviceName,
        };

        if (entry.error) {
            attributes["error.name"] = entry.error.name;
            attributes["error.message"] = entry.error.message;
            attributes["error.stack"] = entry.error.stack;
        }

        const record: LogRecord = {
            body: entry.message,
            timestamp: Date.now(),
            observedTimestamp: Date.now(),
            severityNumber: toSeverityNumber(entry.level),
            severityText: entry.level.toUpperCase(),
            attributes,
            context: otelContext.active(),
        };

        otelLogger.emit(record);
    }

    function shutdownLogsExporter(): Promise<void> {
        return loggerProvider?.shutdown() ?? Promise.resolve();
    }

    return {
        initializeLogsExporter,
        exportLogEntry,
        shutdownLogsExporter,
    };
}


