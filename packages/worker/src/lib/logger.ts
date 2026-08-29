import { createFileLogger, fileLoggerOptionsFromEnv } from "@gamepile/shared/file-logger";
import { composeLogSinks } from "@gamepile/shared/log-sinks";
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
const SERVICE_NAME = process.env.LOG_SERVICE || "gamepile-worker";

const fileLogger = createFileLogger(fileLoggerOptionsFromEnv(SERVICE_NAME));

/**
 * Every configured log destination behind a single callback. Sinks are isolated
 * from one another, so a full disk or an unreachable collector cannot throw into
 * a job handler.
 */
export const logSinks = composeLogSinks([
    { name: "otlp", exportLogEntry },
    fileLogger.toLogSink(),
]);

export const logger = createLogger({
    exportLogEntry: logSinks.exportLogEntry,
    mirrorToStdout: env.WORKER_LOG_TO_STDOUT !== "false",
}, {
    hostname: HOSTNAME,
    ips: IPS,
    node_env: env.NODE_ENV,
});

/**
 * Flushes buffered log entries to every configured sink and shuts them down.
 *
 * Should be called during graceful shutdown to ensure no log entries are lost.
 *
 * @returns A promise that resolves when all sinks have been flushed.
 */
export async function flushLogs(): Promise<void> {
    await logSinks.shutdown?.();
    await shutdownLogsExporter();
}