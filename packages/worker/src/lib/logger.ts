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

import { createLogger, type ILogger, type LogContext, type LogEntry } from "@gamepile/shared/logger";

import { getWorkerEnv } from "@/src/lib/env.js";
import { exportLogEntry, shutdownLogsExporter } from "@/src/lib/logs-exporter.js";

export type { ILogger, LogContext, LogEntry };

const env = getWorkerEnv();

export const logger = createLogger({
    exportLogEntry,
    mirrorToStdout: env.WORKER_LOG_TO_STDOUT !== "false",
});

export function flushLogs(): Promise<void> {
    return shutdownLogsExporter();
}