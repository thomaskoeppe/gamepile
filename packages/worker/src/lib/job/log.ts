import prisma from "@/src/lib/prisma.js";

/**
 * Writes a structured log entry for a job to the database.
 *
 * @param jobId - The database ID of the job to log against.
 * @param level - Severity of the log entry: `"info"`, `"warn"`, `"error"`, or
 *   `"success"`.
 * @param message - Human-readable description of the event being logged.
 * @returns A promise that resolves when the log record has been persisted.
 */
export async function createLog(jobId: string, level: "info" | "warn" | "error" | "success", message: string) {
    await prisma.jobLog.create({
        data: {
            jobId,
            level,
            message
        }
    })
}