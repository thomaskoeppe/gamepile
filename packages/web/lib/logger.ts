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

import { exportLogEntry } from "@/lib/logs-exporter";

export type { ILogger, LogContext, LogEntry };

export const logger = createLogger({
    exportLogEntry,
    skipInBrowser: true,
    mirrorToStdout: true,
});
