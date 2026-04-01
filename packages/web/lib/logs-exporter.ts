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

import { createLogsExporter } from "@gamepile/shared/logs-exporter";

const logsExporter = createLogsExporter({
    serviceName: "gamepile-web",
    skipInBrowser: true,
});

export const initializeLogsExporter = logsExporter.initializeLogsExporter;
export const exportLogEntry = logsExporter.exportLogEntry;
export const shutdownLogsExporter = logsExporter.shutdownLogsExporter;
