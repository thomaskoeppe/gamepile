import { headers } from "next/headers";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";

import {SessionData} from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

/** Global middleware limiter — anonymous requests */
export const globalAnonLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl:global:anon",
    points: 30,
    duration: 60,
    blockDuration: 0,
});

/** Global middleware limiter — authenticated requests */
export const globalAuthLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl:global:auth",
    points: 300,
    duration: 60,
    blockDuration: 0,
});

/** Server action limiter — anonymous */
export const actionAnonLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl:action:anon",
    points: 15,
    duration: 60,
    blockDuration: 0,
});

/** Server action limiter — authenticated */
export const actionAuthLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl:action:auth",
    points: 60,
    duration: 60,
    blockDuration: 0,
});

/** Auth endpoint limiter (login/callback) — strict, IP-only */
export const authEndpointLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl:auth",
    points: 10,
    duration: 60,
    blockDuration: 30,
});

/** Search endpoint limiter */
export const searchLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl:search",
    points: 40,
    duration: 60,
    blockDuration: 0,
});

/** Public collection limiter — anonymous reads */
export const publicCollectionLimiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: "rl:public:collection",
    points: 30,
    duration: 60,
    blockDuration: 0,
});

export interface RateLimitResult {
    success: boolean;
    limit: number;
    remaining: number;
    retryAfterMs: number;
}

function toResult(
    limiter: RateLimiterRedis,
    res: RateLimiterRes,
    blocked: boolean,
): RateLimitResult {
    return {
        success: !blocked,
        limit: limiter.points,
        remaining: Math.max(0, res.remainingPoints),
        retryAfterMs: blocked ? res.msBeforeNext : 0,
    };
}

/**
 * Consume one point from the given limiter.
 *
 * @param limiter   The `RateLimiterRedis` instance to consume from.
 * @param key       The rate-limit key (IP, userId, session token, etc.).
 * @returns         A {@link RateLimitResult} indicating success or rejection.
 */
const log = logger.child("server.services.auth:rateLimit");

export async function consumeRateLimit(
    limiter: RateLimiterRedis,
    key: string,
): Promise<RateLimitResult> {
    try {
        const res = await limiter.consume(key, 1);
        log.debug("Rate limit consumed", {
            key,
            limiter: limiter.keyPrefix,
            remaining: res.remainingPoints,
            limit: limiter.points,
        });
        return toResult(limiter, res, false);
    } catch (err: unknown) {
        if (err instanceof RateLimiterRes) {
            log.warn("Rate limit exceeded", {
                key,
                limiter: limiter.keyPrefix,
                retryAfterMs: err.msBeforeNext,
                limit: limiter.points,
                consumedPoints: err.consumedPoints,
            });
            return toResult(limiter, err, true);
        }

        log.error("Redis error in rate limiter — failing open", err instanceof Error ? err : new Error(String(err)), {
            key,
            limiter: limiter.keyPrefix,
        });
        return { success: true, limit: 0, remaining: 0, retryAfterMs: 0 };
    }
}

/**
 * Extract the client IP from request headers.
 * Falls back to `"unknown"` if no forwarded header is present.
 */
export function getClientIp(request: Request): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown"
    );
}

/**
 * Extract client IP inside a server action / server component
 * (reads from Next.js `headers()` async context).
 */
export async function getClientIpFromHeaders(): Promise<string> {
    const h = await headers();
    return (
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        h.get("x-real-ip") ||
        "unknown"
    );
}

export interface ActionRateLimitOptions {
    /** Override the default anonymous limiter. */
    anonLimiter?: RateLimiterRedis;
    /** Override the default authenticated limiter. */
    authLimiter?: RateLimiterRedis;
    session?: SessionData;
}

/**
 * Rate-limit a server action. Automatically determines the correct limiter
 * and key based on whether the request is authenticated.
 *
 * Returns `null` when the request is allowed, or an error object when blocked.
 */
export async function rateLimitAction(
    opts?: ActionRateLimitOptions,
): Promise<{ success: false; message: string } | null> {
    const ip = await getClientIpFromHeaders();

    const limiter = opts?.session ? (opts?.authLimiter ?? actionAuthLimiter) : (opts?.anonLimiter ?? actionAnonLimiter);

    const key = opts?.session ? `user:${opts.session.user.id}` : `ip:${ip}`;
    const result = await consumeRateLimit(limiter, key);

    if (!result.success) {
        return {
            success: false,
            message: `Too many requests. Please try again in ${Math.ceil(result.retryAfterMs / 1000)} seconds.`,
        };
    }

    return null;
}

/**
 * Rate-limit a server action for anonymous-only access (e.g. public collection reads).
 */
export async function rateLimitPublic(
    limiter: RateLimiterRedis = publicCollectionLimiter,
): Promise<{ success: false; message: string } | null> {
    const ip = await getClientIpFromHeaders();
    const result = await consumeRateLimit(limiter, `ip:${ip}`);

    if (!result.success) {
        return {
            success: false,
            message: `Too many requests. Please try again in ${Math.ceil(result.retryAfterMs / 1000)} seconds.`,
        };
    }

    return null;
}

