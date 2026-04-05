import prisma from "@/src/lib/prisma.js";

/**
 * Creates a structured log entry for a background job in the database.
 *
 * These logs are visible in the admin panel's job detail view and provide
 * a persistent audit trail of job execution steps.
 *
 * @param jobId - The UUID of the parent job to attach the log to.
 * @param level - Severity level of the log entry.
 * @param message - Human-readable log message.
 */
export async function createLog(
    jobId: string,
    level: "info" | "warn" | "error" | "success",
    message: string,
): Promise<void> {
    await prisma.jobLog.create({
        data: { jobId, level, message },
    });
}