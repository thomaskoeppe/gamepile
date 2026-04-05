/**
 * Worker entry point — validates environment, initializes telemetry and logging,
 * starts the BullMQ workers, and installs graceful shutdown handlers.
 *
 * @module index
 */
import {z} from "zod";

import {validateWorkerEnv} from "@/src/lib/env.js";

const envResult = validateWorkerEnv();

if (!envResult.success) {
    process.stderr.write("Worker environment variable validation failed\n");
    process.stderr.write(`${z.prettifyError(envResult.error)}\n`);
    process.exit(1);
}

const [{shutdownTracing}, {initializeLogsExporter}, {logger}, workerModule] = await Promise.all([
    import("@/src/instrumentation.js"),
    import("@/src/lib/logs-exporter.js"),
    import("@/src/lib/logger.js"),
    import("@/src/worker.js"),
]);

initializeLogsExporter();

const {shutdownWorkers} = workerModule;
const log = logger.child("worker.index");

log.info("Starting...");

/**
 * Gracefully shuts down the worker process.
 *
 * Stops all BullMQ workers, flushes telemetry, and exits the process.
 *
 * @param signal - The OS signal that triggered the shutdown (e.g., `"SIGINT"`, `"SIGTERM"`).
 */
async function shutdown(signal: string): Promise<void> {
    log.info(`Received ${signal}, shutting down...`);

    try {
        await shutdownWorkers(signal);
        await shutdownTracing();
        process.exit(0);
    } catch (e) {
        log.error("Error during shutdown", e as Error);
        await shutdownTracing();
        process.exit(1);
    }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));