import {logger} from "@/src/lib/logger.js";
import {redis} from "@/src/lib/redis.js";
import {getWorkerEnv} from "@/src/lib/env.js";

const log = logger.child("worker.lib.steam:ratelimiter");

/**
 * Error thrown when the Steam API responds with a rate-limit status (HTTP 429 or 403).
 *
 * Signals that the caller should back off before retrying.
 */
export class SteamRateLimitError extends Error {
    /** The HTTP status code that triggered this error (429 or 403). */
    readonly status: number;

    /**
     * @param appId - The Steam appId that was being requested when the limit was hit.
     * @param status - The HTTP status code returned by Steam.
     */
    constructor(appId: number, status: number) {
        super(`Steam rate-limited appId ${appId}: HTTP ${status}`);
        this.name   = "SteamRateLimitError";
        this.status = status;
    }
}

/**
 * Returns a promise that resolves after the specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep.
 * @returns A promise that resolves after `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate limiter for outbound requests to the Steam Web API.
 *
 * Supports two modes of operation:
 * - **local**: Token-bucket style limiter with a sliding window and minimum interval,
 *   suitable for a single worker process.
 * - **distributed**: Redis-backed sliding window counter with a distributed minimum-interval
 *   lock, suitable for multi-worker deployments.
 *
 * When a rate limit is detected (HTTP 429/403), callers should invoke {@link reportRateLimit}
 * to trigger a cooldown period across all workers.
 */
class SteamRateLimiter {
    /** Duration of the cooldown period after a rate limit is hit (30 seconds). */
    private static readonly COOLDOWN_MS = 30_000;
    /** Redis key used to coordinate cooldown across distributed workers. */
    private static readonly COOLDOWN_REDIS_KEY = "ratelimit:steam:cooldown";
    /** Maximum number of requests allowed per window. */
    private readonly max:           number;
    /** Duration of the rate-limit window in milliseconds. */
    private readonly windowMs:      number;
    /** Minimum interval between consecutive requests in milliseconds. */
    private readonly minIntervalMs: number;
    /** Whether rate limiting is local (in-process) or distributed (Redis-backed). */
    private readonly scope: "local" | "distributed";
    /** Start timestamp of the current local window. */
    private windowStart: number;
    /** Number of requests made in the current local window. */
    private count:       number;
    /** Queue of pending resolve callbacks waiting for a slot. */
    private readonly pending: Array<() => void> = [];
    /** Whether the local drain loop is currently running. */
    private draining = false;
    /** Timestamp (ms) until which all requests should be held back. */
    private cooldownUntil = 0;
    /** Timestamp (ms) of the last successful acquire. */
    private lastAcquireAt = 0;

    /**
     * Creates a new Steam rate limiter instance.
     *
     * @param opts - Configuration options.
     * @param opts.max - Maximum requests per window.
     * @param opts.windowMs - Window duration in milliseconds.
     * @param opts.minIntervalMs - Minimum interval between consecutive requests.
     * @param opts.scope - `"local"` for single-process or `"distributed"` for Redis-backed.
     */
    constructor(opts: {
        max: number;
        windowMs: number;
        minIntervalMs: number;
        scope: "local" | "distributed";
    }) {
        this.max = opts.max;
        this.windowMs = opts.windowMs;
        this.minIntervalMs = opts.minIntervalMs;
        this.scope = opts.scope;
        this.windowStart = Date.now();
        this.count = 0;
    }

    /**
     * Returns a snapshot of the current rate limiter state for debugging/monitoring.
     *
     * @returns An object with the current count, max, time until window reset, and queue depth.
     */
    get snapshot(): { count: number; max: number; resetsInMs: number; queued: number } {
        return {
            count: this.count,
            max: this.max,
            resetsInMs: Math.max(0, this.windowMs - (Date.now() - this.windowStart)),
            queued: this.pending.length,
        };
    }

    /**
     * Reports that a Steam rate limit response was received.
     *
     * Activates a cooldown period of {@link COOLDOWN_MS} during which all
     * pending and future `acquire()` calls will wait. In distributed mode,
     * the cooldown is also published to Redis so other workers honor it.
     */
    reportRateLimit(): void {
        const until = Date.now() + SteamRateLimiter.COOLDOWN_MS;

        if (until <= this.cooldownUntil) return;

        this.cooldownUntil = until;

        log.warn("Steam rate limit hit — entering cooldown", {
            cooldownMs: SteamRateLimiter.COOLDOWN_MS,
            scope: this.scope,
        });

        if (this.scope === "distributed") {
            redis.set(
                SteamRateLimiter.COOLDOWN_REDIS_KEY, until.toString(),
                "PX", SteamRateLimiter.COOLDOWN_MS,
            ).catch((err) => {
                log.warn("Failed to set distributed cooldown key", {
                    message: err instanceof Error ? err.message : "Unknown error",
                });
            });
        }
    }

    /**
     * Acquires a rate-limit slot before making a Steam API request.
     *
     * This method blocks (via `await`) until a slot is available, respecting
     * both the per-window budget and the minimum inter-request interval.
     * Also waits for any active cooldown to expire first.
     *
     * @returns A promise that resolves when the caller may proceed with the request.
     */
    async acquire(): Promise<void> {
        await this.waitForCooldown();

        if (this.scope === "distributed") {
            await this.acquireDistributed();
            return;
        }

        await this.acquireLocal();
    }

    /**
     * Waits until the current cooldown period has expired.
     *
     * In distributed mode, also checks Redis for a cooldown set by another worker.
     */
    private async waitForCooldown(): Promise<void> {
        let remaining = this.cooldownUntil - Date.now();

        if (this.scope === "distributed") {
            const remoteCooldown = await redis.get(SteamRateLimiter.COOLDOWN_REDIS_KEY);
            if (remoteCooldown) {
                const remoteUntil = Number(remoteCooldown);
                const remoteRemaining = remoteUntil - Date.now();
                if (remoteRemaining > remaining) {
                    remaining = remoteRemaining;
                }
            }
        }

        if (remaining > 0) {
            log.debug("Waiting for rate limit cooldown", {remainingMs: remaining});
            await sleep(remaining);
        }
    }

    /**
     * Enqueues the caller in the local pending queue and triggers the drain loop.
     *
     * Used in `"local"` scope mode.
     *
     * @returns A promise that resolves when the caller's slot is granted.
     */
    private acquireLocal(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.pending.push(resolve);
            void this.drain();
        });
    }

    /**
     * Acquires a rate-limit slot using Redis-backed distributed counters.
     *
     * Uses a per-window counter key and a minimum-interval lock to coordinate
     * across multiple worker processes.
     *
     * Used in `"distributed"` scope mode.
     */
    private async acquireDistributed(): Promise<void> {
        const windowCountKey = `ratelimit:steam:window:${Math.floor(Date.now() / this.windowMs)}`;

        while (true) {
            const count = await redis.incr(windowCountKey);

            if (count === 1) {
                await redis.pexpire(windowCountKey, this.windowMs + 1_000);
            }

            if (count <= this.max) break;

            const elapsedInWindow = Date.now() % this.windowMs;
            const waitMs = Math.max(50, this.windowMs - elapsedInWindow + 50);

            log.debug("Distributed budget exhausted, waiting for next window", {
                count,
                max: this.max,
                waitMs,
                key: windowCountKey,
            });

            await sleep(waitMs);
        }

        const minIntervalKey = "ratelimit:steam:min-interval";
        while (true) {
            const locked = await redis.set(minIntervalKey, "1", "PX", this.minIntervalMs, "NX");
            if (locked === "OK") return;
            await sleep(Math.min(100, this.minIntervalMs));
        }
    }

    /**
     * Processes the local pending queue, granting slots one at a time while
     * respecting the window budget and minimum interval.
     *
     * Only one drain loop runs at a time (guarded by {@link draining}).
     */
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
                    log.debug("Local budget exhausted, waiting for window reset", {
                        count: this.count,
                        max: this.max,
                        waitMs,
                    });
                    await sleep(waitMs);
                    continue;
                }

                const elapsed = Date.now() - this.lastAcquireAt;
                if (elapsed < this.minIntervalMs) {
                    await sleep(this.minIntervalMs - elapsed);
                }

                this.lastAcquireAt = Date.now();
                this.count++;
                const resolve = this.pending.shift()!;
                resolve();
            }
        } finally {
            this.draining = false;
        }
    }
}

const env = getWorkerEnv();

/**
 * Singleton Steam rate limiter instance, configured from environment variables.
 *
 * All Steam API calls should call `steamRateLimiter.acquire()` before making a request.
 */
export const steamRateLimiter = new SteamRateLimiter({
    max: env.WORKER_STEAM_RATE_LIMIT_MAX,
    windowMs: env.WORKER_STEAM_RATE_LIMIT_WINDOW_MS,
    minIntervalMs: env.WORKER_STEAM_RATE_LIMIT_MIN_INTERVAL_MS,
    scope: env.WORKER_STEAM_RATE_LIMIT_SCOPE,
});
