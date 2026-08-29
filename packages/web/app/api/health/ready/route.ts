/**
 * app/api/health/ready/route.ts
 *
 * Readiness probe. Unlike `/api/v1/heartbeat` — which only proves the process is
 * accepting connections — this endpoint exercises the dependencies a request
 * actually needs, so a container that is running but cannot serve is reported
 * as unhealthy instead of silently returning 500s.
 *
 * GET /api/health/ready
 *   200 — every dependency reachable
 *   503 — at least one dependency is down (body names which)
 */

import { NextResponse } from "next/server";

import { areSettingsLoaded } from "@/lib/app-settings";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** How long a single dependency check may take before it counts as failed. */
const CHECK_TIMEOUT_MS = 3_000;

type CheckStatus = "ok" | "error";

interface CheckResult {
    status: CheckStatus;
    durationMs: number;
    error?: string;
}

/**
 * Runs a dependency check under a timeout, converting any failure into a result
 * object. Never throws — a readiness probe that 500s tells operators nothing.
 */
async function runCheck(name: string, check: () => Promise<unknown>): Promise<CheckResult> {
    const start = Date.now();

    try {
        await Promise.race([
            check(),
            new Promise((_resolve, reject) =>
                setTimeout(() => reject(new Error(`${name} check timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS),
            ),
        ]);

        return { status: "ok", durationMs: Date.now() - start };
    } catch (error) {
        return {
            status: "error",
            durationMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function GET() {
    const log = logger.child("api.routes.health:ready");

    const [database, cache] = await Promise.all([
        runCheck("database", () => prisma.$queryRaw`SELECT 1`),
        runCheck("redis", () => redis.ping()),
    ]);

    // Settings falling back to defaults is a degraded state worth surfacing, but
    // the app still serves, so it does not on its own fail readiness.
    const settings: CheckResult = areSettingsLoaded()
        ? { status: "ok", durationMs: 0 }
        : { status: "error", durationMs: 0, error: "App settings not loaded — serving defaults" };

    const ready = database.status === "ok" && cache.status === "ok";

    const body = {
        status: ready ? "ok" : "unavailable",
        version: process.env.WEB_APP_VERSION ?? "unknown",
        checks: { database, redis: cache, settings },
    };

    if (!ready) {
        log.warn("Readiness check failed", {
            database: database.status,
            redis: cache.status,
            settings: settings.status,
            databaseError: database.error,
            redisError: cache.error,
        });
    }

    return NextResponse.json(body, {
        status: ready ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
    });
}
