import {createLogsExporter} from "@gamepile/shared/logs-exporter";

/**
 * OTLP logs exporter instance for the worker service.
 *
 * Exports structured log entries to the configured OTLP endpoint
 * under the `gamepile-worker` service name.
 */
const logsExporter = createLogsExporter({
    serviceName: "gamepile-worker",
});

/** Initializes the OTLP log exporter. Must be called once at worker startup. */
export const initializeLogsExporter = logsExporter.initializeLogsExporter;

/** Forwards a single log entry to the OTLP exporter. */
export const exportLogEntry = logsExporter.exportLogEntry;

/**
 * Flushes pending log entries and shuts down the OTLP exporter.
 *
 * @returns A promise that resolves when the exporter has been cleanly shut down.
 */
export const shutdownLogsExporter = logsExporter.shutdownLogsExporter;
