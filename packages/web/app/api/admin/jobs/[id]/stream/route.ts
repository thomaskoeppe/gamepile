import { requireAdmin } from "@/lib/auth/admin";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { sseEvent, ssePing } from "@/lib/sse";
import { isTerminal } from "@/types/job";

const POLL_INTERVAL_MS = 2_000;
const KEEPALIVE_INTERVAL_MS = 15_000;
const LOG_TAIL = 50;

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const log = logger.child("api.routes.admin.jobs:stream", {
        requestId: req.headers.get("x-request-id") ?? undefined,
    });
    try {
        await requireAdmin();
    } catch {
        return new Response("Forbidden", { status: 403 });
    }

    const { id: jobId } = await params;
    const encoder = new TextEncoder();

    let pollId: ReturnType<typeof setInterval> | null = null;
    let keepAliveId: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    let lastLogId: string | null = null;

    function cleanup() {
        closed = true;
        if (pollId) { clearInterval(pollId); pollId = null; }
        if (keepAliveId) { clearInterval(keepAliveId); keepAliveId = null; }
    }

    const stream = new ReadableStream({
        async start(controller) {
            function send(raw: string): void {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(raw));
                } catch {
                    cleanup();
                }
            }

            async function poll(): Promise<void> {
                if (closed) return;

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
                    cleanup();
                    controller.close();
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
                    cleanup();
                    controller.close();
                }
            }

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

            await poll();

            if (!closed) {
                pollId = setInterval(() => void poll(), POLL_INTERVAL_MS);
                keepAliveId = setInterval(() => send(ssePing()), KEEPALIVE_INTERVAL_MS);
            }
        },

        cancel() {
            cleanup();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
