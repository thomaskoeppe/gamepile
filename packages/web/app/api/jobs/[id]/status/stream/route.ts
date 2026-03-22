import { getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { isTerminal,JobSnapshot } from "@/types/job";

const POLL_INTERVAL_MS     = 2_000;
const KEEPALIVE_INTERVAL_MS = 15_000;
const LOG_TAIL              = 20;

function sseEvent(name: string, data: unknown): string {
    return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function ssePing(): string {
    return `: ping\n\n`;
}

async function fetchSnapshot(
    jobId: string,
    userId: string,
): Promise<JobSnapshot | null> {
    const job = await prisma.job.findUnique({
        where: {
            id:     jobId,
            userId,
        },
        select: {
            id:             true,
            type:           true,
            status:         true,
            processedItems: true,
            totalItems:     true,
            failedItems:    true,
            allItemsQueued: true,
            startedAt:      true,
            finishedAt:     true,
            errorMessage:   true,
            createdAt:      true,
            logs: {
                orderBy: { timestamp: "desc" },
                take:    LOG_TAIL,
                select: {
                    id:        true,
                    message:   true,
                    level:     true,
                    timestamp: true,
                },
            },
        },
    });

    if (!job) return null;

    return {
        ...job,
        startedAt:  job.startedAt?.toISOString()  ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        createdAt:  job.createdAt.toISOString(),
        logs: job.logs
            .reverse()
            .map((l) => ({ ...l, timestamp: l.timestamp.toISOString() })),
    };
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const log = logger.child("api.routes.jobs:statusStream");
    const { id: jobId } = await params;

    const session = await getCurrentSession();
    if (!session) {
        return new Response("Unauthorized", { status: 401 });
    }

    const userId  = session.user.id;
    const encoder = new TextEncoder();

    let pollId:      ReturnType<typeof setInterval> | null = null;
    let keepAliveId: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    function cleanup() {
        closed = true;
        if (pollId)      { clearInterval(pollId);      pollId      = null; }
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

                let snapshot: JobSnapshot | null;
                try {
                    snapshot = await fetchSnapshot(jobId, userId);
                } catch {
                    log.error("SSE snapshot poll failed", undefined, {
                        jobId,
                        userId,
                    });
                    return;
                }

                if (!snapshot) {
                    send(sseEvent("error", { message: "Job not found or access denied" }));
                    cleanup();
                    controller.close();
                    return;
                }

                send(sseEvent("snapshot", snapshot));

                if (isTerminal(snapshot.status)) {
                    send(sseEvent("done", { status: snapshot.status }));
                    cleanup();
                    controller.close();
                }
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
            "Content-Type":    "text/event-stream",
            "Cache-Control":   "no-cache, no-transform",
            "Connection":      "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}