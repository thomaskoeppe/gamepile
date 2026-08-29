export function sseEvent(name: string, data: unknown): string {
    return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function ssePing(): string {
    return ": ping\n\n";
}

/** Standard headers for a server-sent-events response. */
export const SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
} as const;

/** Absolute lifetime of a stream, after which it closes itself. */
export const DEFAULT_MAX_STREAM_DURATION_MS = 30 * 60_000;

export interface PollingSseHandle {
    /** Emits a raw SSE frame. No-ops once the stream is closed. */
    send: (raw: string) => void;
    /** Ends the stream and releases its timers. */
    close: () => void;
}

export interface PollingSseOptions {
    /**
     * Abort signal from the incoming `Request`. Wiring this is what prevents
     * leaked pollers: `ReadableStream.cancel()` is not guaranteed to fire when a
     * client disconnects abruptly, and a missed cleanup leaves an interval
     * querying the database forever.
     */
    signal?: AbortSignal;
    /** Called once immediately, then on every interval tick. */
    poll: (handle: PollingSseHandle) => Promise<void> | void;
    pollIntervalMs: number;
    keepAliveIntervalMs: number;
    maxDurationMs?: number;
    /** Invoked once when the stream shuts down, for any reason. */
    onClose?: (reason: "client" | "server" | "timeout") => void;
}

/**
 * Builds a `ReadableStream` that polls on an interval and emits keep-alive
 * pings, with cleanup guaranteed through three independent paths: the consumer
 * cancelling, the request aborting, and an absolute duration cap.
 *
 * @param options - Poll callback plus timing and lifecycle configuration.
 * @returns A stream suitable for passing straight to `new Response(...)`.
 */
export function createPollingSseStream(options: PollingSseOptions): ReadableStream<Uint8Array> {
    const {
        signal,
        poll,
        pollIntervalMs,
        keepAliveIntervalMs,
        maxDurationMs = DEFAULT_MAX_STREAM_DURATION_MS,
        onClose,
    } = options;

    const encoder = new TextEncoder();

    let pollId: ReturnType<typeof setInterval> | null = null;
    let keepAliveId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let onAbort: (() => void) | null = null;

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            function cleanup(reason: "client" | "server" | "timeout"): void {
                if (closed) return;
                closed = true;

                if (pollId) {
                    clearInterval(pollId);
                    pollId = null;
                }
                if (keepAliveId) {
                    clearInterval(keepAliveId);
                    keepAliveId = null;
                }
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                if (onAbort && signal) {
                    signal.removeEventListener("abort", onAbort);
                    onAbort = null;
                }

                onClose?.(reason);
            }

            function closeStream(reason: "client" | "server" | "timeout"): void {
                const wasOpen = !closed;
                cleanup(reason);

                if (!wasOpen) return;

                try {
                    controller.close();
                } catch {
                    // Already closed or errored by the runtime — nothing to do.
                }
            }

            const handle: PollingSseHandle = {
                send(raw: string): void {
                    if (closed) return;

                    try {
                        controller.enqueue(encoder.encode(raw));
                    } catch {
                        // The consumer went away between checks.
                        cleanup("client");
                    }
                },
                close(): void {
                    closeStream("server");
                },
            };

            if (signal?.aborted) {
                closeStream("client");
                return;
            }

            if (signal) {
                onAbort = () => closeStream("client");
                signal.addEventListener("abort", onAbort, { once: true });
            }

            async function safePoll(): Promise<void> {
                if (closed) return;
                await poll(handle);
            }

            await safePoll();

            if (closed) return;

            pollId = setInterval(() => void safePoll(), pollIntervalMs);
            keepAliveId = setInterval(() => handle.send(ssePing()), keepAliveIntervalMs);
            timeoutId = setTimeout(() => closeStream("timeout"), maxDurationMs);
        },

        cancel() {
            if (closed) return;
            closed = true;

            if (pollId) {
                clearInterval(pollId);
                pollId = null;
            }
            if (keepAliveId) {
                clearInterval(keepAliveId);
                keepAliveId = null;
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            if (onAbort && signal) {
                signal.removeEventListener("abort", onAbort);
                onAbort = null;
            }

            onClose?.("client");
        },
    });
}
