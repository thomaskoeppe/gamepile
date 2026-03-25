import { NextResponse } from "next/server";

import { invalidateSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
    const log = logger.child("api.routes.auth:signout");
    const appUrl = process.env.WEB_APP_URL || new URL(request.url).origin;

    try {
        log.info("Signout initiated (GET)");
        await invalidateSession();
        log.info("Signout completed — redirecting to /");
        return NextResponse.redirect(new URL("/", appUrl));
    } catch (error) {
        log.error("Signout (GET) failed", error instanceof Error ? error : new Error(String(error)));
        return NextResponse.redirect(new URL("/", appUrl));
    }
}

export async function POST() {
    const log = logger.child("api.routes.auth:signout");
    try {
        log.info("Signout initiated (POST)");
        await invalidateSession();
        log.info("Signout completed");
        return NextResponse.json({ success: true });
    } catch (error) {
        log.error("Signout (POST) failed", error instanceof Error ? error : new Error(String(error)));
        return NextResponse.json({ success: false, error: "Logout failed" }, { status: 500 });
    }
}
