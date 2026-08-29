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

import os from "node:os";

import { createFileLogger, fileLoggerOptionsFromEnv } from "@gamepile/shared/file-logger";
import { composeLogSinks } from "@gamepile/shared/log-sinks";
import { createLogger, type ILogger, type LogContext, type LogEntry } from "@gamepile/shared/logger";

import { exportLogEntry } from "@/lib/logs-exporter";

export type { ILogger, LogContext, LogEntry };

const HOSTNAME = os.hostname();
const IPS = Object.values(os.networkInterfaces())
    .flat()
    .filter((iface): iface is os.NetworkInterfaceInfo => !!iface && iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);

const SERVICE_NAME = process.env.LOG_SERVICE || "gamepile-web";

const fileLogger = createFileLogger({
    ...fileLoggerOptionsFromEnv(SERVICE_NAME),
    skipInBrowser: true,
});

/**
 * Every configured destination, fanned out behind one callback. Each sink is
 * isolated, so a failing destination (a full disk, an unreachable collector)
 * cannot throw into a request path.
 */
export const logSinks = composeLogSinks([
    { name: "otlp", exportLogEntry },
    fileLogger.toLogSink(),
]);

export const logger = createLogger({
    exportLogEntry: logSinks.exportLogEntry,
    skipInBrowser: true,
    mirrorToStdout: true,
}, {
    hostname: HOSTNAME,
    ips: IPS,
    env: process.env.NODE_ENV,
    domain: process.env.DOMAIN,
    web_app_url: process.env.WEB_APP_URL,
});
