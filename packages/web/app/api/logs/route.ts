/**
 * app/api/logs/route.ts
 *
 * Receives batched browser logs from lib/browser-logger.ts and forwards them
 * to the OTLP collector via the server-side logger so they appear alongside
 * server logs in your observability backend.
 *
 * POST /api/logs
 * Body: BrowserLogEntry[]   (JSON array)
 */

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { initializeLogsExporter } from '@/lib/logs-exporter';

initializeLogsExporter();

function parseOrigin(value: string): string | null {
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const log = logger.child("api.routes.logs:ingest", {
        requestId: request.headers.get("x-request-id") ?? undefined,
    });
    const originHeader = request.headers.get("origin");
    const requestOrigin = parseOrigin(originHeader ?? "");
    const allowedOrigin = parseOrigin(process.env.WEB_APP_URL ?? "");

    if (originHeader && allowedOrigin && requestOrigin !== allowedOrigin) {
        log.warn("Blocked log ingestion from disallowed origin", {
            requestOrigin,
            allowedOrigin,
        });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let entries: unknown;

    try {
        entries = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!Array.isArray(entries)) {
        return NextResponse.json({ error: 'Body must be a JSON array' }, { status: 400 });
    }

    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;

        const { level, message, context, error } = entry as Record<string, unknown>;

        let err: Error | undefined;
        if (error && typeof error === 'object') {
            const e = error as Record<string, string>;
            err         = new Error(e.message ?? 'Unknown error');
            err.name    = e.name    ?? 'Error';
            err.stack   = e.stack;
        }

        const enrichedContext = {
            ...(typeof context === 'object' && context !== null ? context : {}),
            'log.source':  'browser',
            'http.referer': request.headers.get('referer') ?? undefined,
            'user_agent':   request.headers.get('user-agent') ?? undefined,
        };

        switch (level) {
            case 'debug':
                log.debug(String(message), enrichedContext);
                break;
            case 'warn':
                log.warn(String(message), enrichedContext);
                break;
            case 'error':
                log.error(String(message), err, enrichedContext);
                break;
            case 'info':
            default:
                log.info(String(message), enrichedContext);
        }
    }

    return NextResponse.json({ ok: true, received: entries.length });
}