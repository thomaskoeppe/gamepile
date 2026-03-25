import { shutdownTracing } from "@/src/instrumentation.js";

import {initializeLogsExporter} from "@/src/lib/logs-exporter.js";
initializeLogsExporter();

import {logger, flushLogs} from "@/src/lib/logger.js";
import { jobsWorker, detailsWorker } from "@/src/worker.js";
import prisma from "@/src/lib/prisma.js";
import { redis } from "@/src/lib/redis.js";

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