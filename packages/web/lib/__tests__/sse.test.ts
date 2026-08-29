/**
 * Regression tests for the SSE poller leak.
 *
 * Both job-stream routes previously cleaned up only via `ReadableStream.cancel()`.
 * When a client disconnected abruptly that callback is not guaranteed to fire, so
 * the poll interval kept querying Postgres every 2s for the life of the process.
 * Enough leaked streams exhausted the connection pool, which is what made the
 * settings reload fail and took the deployment down.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPollingSseStream, SSE_HEADERS,sseEvent, ssePing } from "@/lib/sse";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("frame formatting", () => {
    it("emits a well-formed named event terminated by a blank line", () => {
        expect(sseEvent("snapshot", { id: "job-1" })).toBe(
            'event: snapshot\ndata: {"id":"job-1"}\n\n',
        );
    });

    it("emits a comment frame for keep-alives", () => {
        expect(ssePing()).toBe(": ping\n\n");
    });

    it("declares headers that keep proxies from buffering the stream", () => {
        expect(SSE_HEADERS["Content-Type"]).toBe("text/event-stream");
        expect(SSE_HEADERS["Cache-Control"]).toContain("no-transform");
        expect(SSE_HEADERS["X-Accel-Buffering"]).toBe("no");
    });
});

describe("createPollingSseStream", () => {
    it("polls once immediately, then on the configured interval", async () => {
        const poll = vi.fn();

        createPollingSseStream({
            poll,
            pollIntervalMs: 2_000,
            keepAliveIntervalMs: 15_000,
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(poll).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(4_000);
        expect(poll).toHaveBeenCalledTimes(3);
    });

    it("stops polling when the request is aborted", async () => {
        const controller = new AbortController();
        const poll = vi.fn();
        const onClose = vi.fn();

        createPollingSseStream({
            signal: controller.signal,
            poll,
            pollIntervalMs: 2_000,
            keepAliveIntervalMs: 15_000,
            onClose,
        });

        await vi.advanceTimersByTimeAsync(2_000);
        const callsBeforeAbort = poll.mock.calls.length;
        expect(callsBeforeAbort).toBeGreaterThan(0);

        controller.abort();
        await vi.advanceTimersByTimeAsync(60_000);

        // The leak: without abort wiring this kept incrementing forever.
        expect(poll).toHaveBeenCalledTimes(callsBeforeAbort);
        expect(onClose).toHaveBeenCalledWith("client");
        expect(vi.getTimerCount()).toBe(0);
    });

    it("does not start polling when the request is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const poll = vi.fn();

        createPollingSseStream({
            signal: controller.signal,
            poll,
            pollIntervalMs: 2_000,
            keepAliveIntervalMs: 15_000,
        });

        await vi.advanceTimersByTimeAsync(10_000);
        expect(poll).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("closes itself once the maximum duration elapses", async () => {
        const poll = vi.fn();
        const onClose = vi.fn();

        createPollingSseStream({
            poll,
            pollIntervalMs: 2_000,
            keepAliveIntervalMs: 15_000,
            maxDurationMs: 10_000,
            onClose,
        });

        await vi.advanceTimersByTimeAsync(9_000);
        expect(onClose).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(2_000);
        expect(onClose).toHaveBeenCalledWith("timeout");

        // An orphaned stream can never outlive the cap, however it was orphaned.
        const callsAtTimeout = poll.mock.calls.length;
        await vi.advanceTimersByTimeAsync(60_000);
        expect(poll).toHaveBeenCalledTimes(callsAtTimeout);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("releases all timers when the poll callback closes the stream", async () => {
        const onClose = vi.fn();

        createPollingSseStream({
            poll: ({ close }) => { close(); },
            pollIntervalMs: 2_000,
            keepAliveIntervalMs: 15_000,
            onClose,
        });

        await vi.advanceTimersByTimeAsync(0);

        expect(onClose).toHaveBeenCalledWith("server");
        expect(vi.getTimerCount()).toBe(0);
    });

    it("stops polling when the consumer cancels the stream", async () => {
        const poll = vi.fn();
        const onClose = vi.fn();

        const stream = createPollingSseStream({
            poll,
            pollIntervalMs: 2_000,
            keepAliveIntervalMs: 15_000,
            onClose,
        });

        await vi.advanceTimersByTimeAsync(0);
        await stream.cancel();
        const callsAtCancel = poll.mock.calls.length;

        await vi.advanceTimersByTimeAsync(30_000);

        expect(poll).toHaveBeenCalledTimes(callsAtCancel);
        expect(onClose).toHaveBeenCalledWith("client");
        expect(vi.getTimerCount()).toBe(0);
    });

    it("emits keep-alive pings on their own cadence", async () => {
        const stream = createPollingSseStream({
            poll: ({ send }) => { send(sseEvent("snapshot", { ok: true })); },
            pollIntervalMs: 60_000,
            keepAliveIntervalMs: 15_000,
        });

        const reader = stream.getReader();
        const decoder = new TextDecoder();

        await vi.advanceTimersByTimeAsync(0);
        const first = await reader.read();
        expect(decoder.decode(first.value)).toContain("event: snapshot");

        await vi.advanceTimersByTimeAsync(15_000);
        const ping = await reader.read();
        expect(decoder.decode(ping.value)).toBe(": ping\n\n");

        reader.releaseLock();
        await stream.cancel();
    });
});
