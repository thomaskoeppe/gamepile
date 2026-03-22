"use client";

import { useEffect, useRef, useState } from "react";

import { getLatestJobByType } from "@/lib/actions/jobs";
import { browserLog } from "@/lib/browser-logger";
import { JobType } from "@/prisma/generated/enums";
import { isTerminal,JobSnapshot } from "@/types/job";

const REPOLL_INTERVAL_MS = 30_000;

const RECONNECT_ERROR_THRESHOLD = 3;

export type StreamPhase =
    | "loading"
    | "streaming"
    | "terminal"
    | "no-job"
    | "error";

export type UseJobStreamResult = {
    snapshot:       JobSnapshot | null;
    phase:          StreamPhase;
    isReconnecting: boolean;
};

/**
 * React hook that opens an SSE stream for the most recent job of the given type,
 * polls for new jobs when no active stream is open, and manages reconnection logic.
 *
 * Lifecycle:
 * 1. Fetches the latest job snapshot from the server via {@link getLatestJobByType}.
 * 2. If the job is not in a terminal state, opens an SSE stream at
 *    `/api/jobs/{jobId}/status/stream` and listens for `snapshot`, `done`, and
 *    `error` events.
 * 3. Once a terminal state is reached (or no job exists), begins polling every
 *    `REPOLL_INTERVAL_MS` milliseconds so new jobs are picked up automatically.
 * 4. After `RECONNECT_ERROR_THRESHOLD` consecutive SSE transport errors the
 *    `isReconnecting` flag is set to `true`.
 *
 * @param jobType - The {@link JobType} enum value identifying which job category to
 *   track.
 * @returns An object with:
 *   - `snapshot` — the latest {@link JobSnapshot} received, or `null` before the
 *     first snapshot arrives.
 *   - `phase` — the current {@link StreamPhase}: `"loading"` | `"streaming"` |
 *     `"terminal"` | `"no-job"` | `"error"`.
 *   - `isReconnecting` — `true` when the SSE connection has lost multiple consecutive
 *     frames and is attempting to recover.
 */
export function useJobStream(jobType: JobType): UseJobStreamResult {
    const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null);
    const [phase, setPhase] = useState<StreamPhase>("loading");
    const [isReconnecting, setIsReconnecting] = useState(false);

    const jobTypeRef = useRef(jobType);

    useEffect(() => {
        jobTypeRef.current = jobType;
    });

    useEffect(() => {
        let destroyed       = false;
        let es:       EventSource | null = null;
        let repollId: ReturnType<typeof setInterval> | null = null;
        let currentJobId:   string | null = null;
        let consecutiveErrors              = 0;

        /** Closes the active EventSource connection, if any. */
        function closeEs() {
            if (es) { es.close(); es = null; }
        }

        /** Clears the active repoll interval, if any. */
        function clearRepoll() {
            if (repollId) { clearInterval(repollId); repollId = null; }
        }

        /**
         * Tears down the entire effect: marks the closure as destroyed, closes the
         * EventSource, and clears the repoll interval. Called on effect cleanup.
         */
        function destroy() {
            destroyed = true;
            closeEs();
            clearRepoll();
        }

        /**
         * Starts a periodic poll that checks for a new (or updated) job every
         * {@link REPOLL_INTERVAL_MS} milliseconds. If a non-terminal job is found
         * it clears the interval and opens a new SSE stream instead.
         */
        function startRepoll() {
            clearRepoll();

            repollId = setInterval(async () => {
                if (destroyed) { clearRepoll(); return; }

                let result: JobSnapshot | null = null;
                try {
                    result = await getLatestJobByType(jobTypeRef.current);
                } catch {
                    return;
                }

                if (destroyed) return;
                if (!result)   return;

                if (result.id === currentJobId) return;

                currentJobId = result.id;
                setSnapshot(result);

                if (isTerminal(result.status)) {
                    setPhase("terminal");
                } else {
                    clearRepoll();
                    openStream(result.id);
                }
            }, REPOLL_INTERVAL_MS);
        }

        /**
         * Opens a new SSE connection for the given job, replacing any existing one.
         * Wires up `snapshot`, `done`, and `error` named event listeners as well as
         * the generic `onerror` / `onopen` handlers for transport-level events.
         *
         * @param jobId - The database ID of the job whose stream to open.
         */
        function openStream(jobId: string) {
            closeEs();
            currentJobId      = jobId;
            consecutiveErrors = 0;

            const newEs = new EventSource(`/api/jobs/${jobId}/status/stream`);
            es = newEs;

            newEs.addEventListener("snapshot", (ev: MessageEvent) => {
                if (destroyed) return;
                try {
                    const payload = JSON.parse(ev.data) as JobSnapshot;
                    setSnapshot(payload);
                    setIsReconnecting(false);
                    consecutiveErrors = 0;
                    setPhase(isTerminal(payload.status) ? "terminal" : "streaming");
                } catch {
                    browserLog.error("Failed to parse stream snapshot payload", new Error("Invalid JSON in snapshot event"), { rawData: ev.data });
                }
            });

            newEs.addEventListener("done", () => {
                if (destroyed) return;
                closeEs();
                setPhase("terminal");
                startRepoll();
            });

            newEs.addEventListener("error", (ev: MessageEvent) => {
                if (destroyed) return;
                try {
                    const data = JSON.parse(ev.data) as { message: string };
                    browserLog.error("Received server error event from job stream", new Error(data.message));
                } catch {}
                closeEs();
                setPhase("error");
            });

            newEs.onerror = () => {
                if (destroyed) return;
                consecutiveErrors += 1;
                if (consecutiveErrors >= RECONNECT_ERROR_THRESHOLD) {
                    setIsReconnecting(true);
                }
            };

            newEs.onopen = () => {
                if (destroyed) return;
                consecutiveErrors = 0;
                setIsReconnecting(false);
                setPhase("streaming");
            };
        }

        /**
         * Bootstraps the hook: resets all state, fetches the latest job, and either
         * opens an SSE stream (non-terminal job) or starts the repoll interval
         * (terminal job or no job found). Errors during the initial fetch transition
         * the phase to `"error"`.
         */
        async function init() {
            setPhase("loading");
            setSnapshot(null);
            setIsReconnecting(false);
            consecutiveErrors = 0;
            currentJobId      = null;

            let initial: JobSnapshot | null = null;
            try {
                initial = await getLatestJobByType(jobTypeRef.current);
            } catch {
                if (!destroyed) setPhase("error");
                return;
            }

            if (destroyed) return;

            if (!initial) {
                setPhase("no-job");
                startRepoll();
                return;
            }

            currentJobId = initial.id;
            setSnapshot(initial);

            if (isTerminal(initial.status)) {
                setPhase("terminal");
                startRepoll();
                return;
            }

            openStream(initial.id);
        }

        void init();

        return destroy;
    }, [jobType]);

    return { snapshot, phase, isReconnecting };
}