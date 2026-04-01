import { z } from "zod";

import { validateWorkerEnv } from "@/src/lib/env.js";

const envValidateResult = validateWorkerEnv();

if (!envValidateResult.success) {
    process.stderr.write("Worker environment variable validation failed\n");
    process.stderr.write(`${z.prettifyError(envValidateResult.error)}\n`);
    process.exit(1);
}

const [{ shutdownTracing }, { initializeLogsExporter }, { logger, flushLogs }, workerModule, { default: prisma }, { redis }] = await Promise.all([
    import("@/src/instrumentation.js"),
    import("@/src/lib/logs-exporter.js"),
    import("@/src/lib/logger.js"),
    import("@/src/worker.js"),
    import("@/src/lib/prisma.js"),
    import("@/src/lib/redis.js"),
]);

initializeLogsExporter();

const { jobsWorker, detailsWorker } = workerModule;

const log = logger.child("worker.index");

log.info("Starting...");

/**
 * Graceful shutdown handler registered on SIGINT and SIGTERM.
 * Closes BullMQ workers, disconnects Prisma and Redis, flushes logs,
 * and shuts down the OpenTelemetry tracing provider before exiting.
 *
 * @param signal - The OS signal that triggered shutdown.
 */
async function shutdown(signal: string) {
    log.info(`Received ${signal}, shutting down...`);

    try {
        if (jobsWorker) await jobsWorker.close();
    } catch (e) {
        log.error("Error closing worker", e as Error);
    }

    try {
        if (detailsWorker) await detailsWorker.close();
    } catch (e) {
        log.error("Error closing rateLimitWorker", e as Error);
    }
    
    await prisma.$disconnect();
    await redis.quit();
    log.info("Shutdown complete");
    await flushLogs();
    await shutdownTracing();
    process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));