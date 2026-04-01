import {logger} from "@/src/lib/logger.js";
import {redis} from "@/src/lib/redis.js";
import { getWorkerEnv } from "@/src/lib/env.js";

const log = logger.child("steam.ratelimiter");

const DEFAULT_MAX = 200;
const DEFAULT_WINDOW_MS = 5 * 60 * 1_000;

const DEFAULT_MIN_INTERVAL_MS = 1_500;
const DEFAULT_SCOPE = "distributed";

/**
 * Thrown when Steam returns HTTP 429 or 403, indicating the rate limit has been
 * hit at the network level rather than by the local limiter.
 */
export class SteamRateLimitError extends Error {
    readonly status: number;

    constructor(appId: number, status: number) {
        super(`Steam rate-limited appId ${appId}: HTTP ${status}`);
        this.name   = "SteamRateLimitError";
        this.status = status;
    }
}

/**
 * Sliding-window rate limiter for Steam API calls.
 * Supports both local (per-process) and distributed (Redis-backed) modes.
 * Calling {@link acquire} blocks until a request slot is available.
 */
class SteamRateLimiter {
    private readonly max:           number;
    private readonly windowMs:      number;
    private readonly minIntervalMs: number;
    private readonly scope: "local" | "distributed";

    private windowStart: number;
    private count:       number;

    private readonly pending: Array<() => void> = [];
    private draining = false;

    constructor(
        max: number = DEFAULT_MAX,
        windowMs: number = DEFAULT_WINDOW_MS,
        minIntervalMs: number = DEFAULT_MIN_INTERVAL_MS,
        scope: "local" | "distributed" = DEFAULT_SCOPE,
    ) {
        this.max = max;
        this.windowMs = windowMs;
        this.minIntervalMs = minIntervalMs;
        this.scope = scope;
        this.windowStart = Date.now();
        this.count = 0;
    }

    /**
     * Blocks until a Steam API request slot is available according to the configured
     * window size, max requests, and minimum interval. Uses Redis in distributed mode
     * or an in-process queue in local mode.
     */
    async acquire(): Promise<void> {
        if (this.scope === "distributed") {
            await this.acquireDistributed();
            return;
        }

        await this.acquireLocal();
    }

    private acquireLocal(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.pending.push(resolve);
            void this.drain();
        });
    }

    private async acquireDistributed(): Promise<void> {
        const now = Date.now();
        const windowId = Math.floor(now / this.windowMs);
        const windowCountKey = `ratelimit:steam:window:${windowId}`;

        while (true) {
            const count = await redis.incr(windowCountKey);

            if (count === 1) {
                await redis.pexpire(windowCountKey, this.windowMs + 1_000);
            }

            if (count <= this.max) {
                break;
            }

            const elapsedInWindow = Date.now() % this.windowMs;
            const waitMs = Math.max(50, this.windowMs - elapsedInWindow + 50);

            log.info(
                `[SteamRateLimiter] Distributed budget exhausted (${count}/${this.max}). ` +
                `Waiting ${Math.round(waitMs / 1_000)}s for next window.`,
                {
                    scope: this.scope,
                    max: this.max,
                    windowMs: this.windowMs,
                    key: windowCountKey,
                },
            );

            await sleep(waitMs);
        }

        const minIntervalKey = "ratelimit:steam:min-interval";
        while (true) {
            const locked = await redis.set(minIntervalKey, "1", "PX", this.minIntervalMs, "NX");
            if (locked === "OK") {
                return;
            }

            await sleep(Math.min(100, this.minIntervalMs));
        }
    }

    private async drain(): Promise<void> {
        if (this.draining) return;
        this.draining = true;

        try {
            while (this.pending.length > 0) {
                const now = Date.now();
                if (now - this.windowStart >= this.windowMs) {
                    this.windowStart = now;
                    this.count = 0;
                }

                if (this.count >= this.max) {
                    const waitMs = this.windowMs - (Date.now() - this.windowStart) + 50;
                    log.info(
                        `[SteamRateLimiter] Budget exhausted (${this.count}/${this.max}). ` +
                        `Waiting ${Math.round(waitMs / 1_000)}s until window resets.`,
                        {
                            max: this.max,
                            windowMs: this.windowMs,
                            windowStart: this.windowStart,
                            count: this.count,
                        },
                    );
                    await sleep(waitMs);
                    continue;
                }

                this.count++;
                const resolve = this.pending.shift()!;
                resolve();

                if (this.pending.length > 0) {
                    await sleep(this.minIntervalMs);
                }
            }
        } finally {
            this.draining = false;
        }
    }

    get snapshot(): { count: number; max: number; resetsInMs: number, queued: number } {
        return {
            count: this.count,
            max: this.max,
            resetsInMs: Math.max(0, this.windowMs - (Date.now() - this.windowStart)),
            queued: this.pending.length,
        };
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export const steamRateLimiter = new SteamRateLimiter(
    getWorkerEnv().WORKER_STEAM_RATE_LIMIT_MAX,
    getWorkerEnv().WORKER_STEAM_RATE_LIMIT_WINDOW_MS,
    getWorkerEnv().WORKER_STEAM_RATE_LIMIT_MIN_INTERVAL_MS,
    getWorkerEnv().WORKER_STEAM_RATE_LIMIT_SCOPE,
);