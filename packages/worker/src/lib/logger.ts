import { createLogger, type ILogger, type LogContext, type LogEntry } from "@gamepile/shared/logger";

import { getWorkerEnv } from "@/src/lib/env.js";
import { exportLogEntry, shutdownLogsExporter } from "@/src/lib/logs-exporter.js";
import os from "node:os";

export type { ILogger, LogContext, LogEntry };

const HOSTNAME = os.hostname();
const IPS = Object.values(os.networkInterfaces())
    .flat()
    .filter((iface): iface is os.NetworkInterfaceInfo => !!iface && iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);

const env = getWorkerEnv();

/**
 * Pre-configured structured logger for the worker process.
 *
 * Includes host metadata (hostname, IPs, NODE_ENV) in every log entry.
 * Optionally mirrors log output to stdout based on the `WORKER_LOG_TO_STDOUT` env var.
 *
 * Use `logger.child("namespace")` to create scoped child loggers.
 */
export const logger = createLogger({
    exportLogEntry,
    mirrorToStdout: env.WORKER_LOG_TO_STDOUT !== "false",
}, {
    hostname: HOSTNAME,
    ips: IPS,
    node_env: env.NODE_ENV,
});

/**
 * Flushes any buffered log entries to the OTLP exporter and shuts down the exporter.
 *
 * Should be called during graceful shutdown to ensure no log entries are lost.
 *
 * @returns A promise that resolves when all logs have been flushed.
 */
export function flushLogs(): Promise<void> {
    return shutdownLogsExporter();
}