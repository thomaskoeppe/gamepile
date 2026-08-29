import { requireAdmin } from "@/lib/auth/admin";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { createPollingSseStream, SSE_HEADERS, sseEvent } from "@/lib/sse";
import { isTerminal } from "@/types/job";

const POLL_INTERVAL_MS = 2_000;
const KEEPALIVE_INTERVAL_MS = 15_000;
const LOG_TAIL = 50;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const log = logger.child("api.routes.admin.jobs:stream", {
        requestId: req.headers.get("x-request-id") ?? undefined,
    });
    try {
        await requireAdmin();
    } catch {
        return new Response("Forbidden", { status: 403 });
    }

    const { id: jobId } = await params;

    let lastLogId: string | null = null;
    let cursorInitialized = false;

    /**
     * Seeds the log cursor so the first snapshot only carries new records.
     * Deferred into the stream so a failure here cannot reject the response.
     */
    async function initializeCursor(): Promise<void> {
        if (cursorInitialized) return;
        cursorInitialized = true;

        try {
            const latestLog = await prisma.jobLog.findFirst({
                where: { jobId },
                orderBy: { timestamp: "desc" },
                select: { id: true },
            });
            lastLogId = latestLog?.id ?? null;
        } catch {
            log.error("Admin SSE log cursor initialization failed", undefined, { jobId });
        }
    }

    const stream = createPollingSseStream({
        signal: req.signal,
        pollIntervalMs: POLL_INTERVAL_MS,
        keepAliveIntervalMs: KEEPALIVE_INTERVAL_MS,
        async poll({ send, close }) {
            await initializeCursor();

            let job;

            try {
                job = await prisma.job.findUnique({
                    where: { id: jobId },
                    select: {
                        id: true,
                        type: true,
                        status: true,
                        progress: true,
                        processedItems: true,
                        totalItems: true,
                        failedItems: true,
                        allItemsQueued: true,
                        startedAt: true,
                        finishedAt: true,
                        errorMessage: true,
                        createdAt: true,
                        logs: {
                            orderBy: { timestamp: "asc" },
                            take: LOG_TAIL,
                            ...(lastLogId ? { cursor: { id: lastLogId }, skip: 1 } : {}),
                            select: {
                                id: true,
                                message: true,
                                level: true,
                                timestamp: true,
                            },
                        },
                    },
                });
            } catch {
                log.error("Admin SSE snapshot poll failed", undefined, { jobId });
                return;
            }

            if (!job) {
                send(sseEvent("error", { message: "Job not found" }));
                close();
                return;
            }

            if (job.logs.length > 0) {
                lastLogId = job.logs[job.logs.length - 1].id;
            }

            const snapshot = {
                ...job,
                startedAt: job.startedAt?.toISOString() ?? null,
                finishedAt: job.finishedAt?.toISOString() ?? null,
                createdAt: job.createdAt.toISOString(),
                logs: job.logs.map((l) => ({
                    ...l,
                    timestamp: l.timestamp.toISOString(),
                })),
            };

            send(sseEvent("snapshot", snapshot));

            if (isTerminal(snapshot.status)) {
                send(sseEvent("done", { status: snapshot.status }));
                close();
            }
        },
        onClose(reason) {
            log.debug("Admin job stream closed", { jobId, reason });
        },
    });

    return new Response(stream, { headers: SSE_HEADERS });
}
