import { NextResponse } from "next/server";

import { sanitizePostAuthRedirect } from "@/lib/auth/redirect";
import { getSteamLoginUrl } from "@/lib/auth/steam";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
    const log = logger.child("api.routes.auth:signin");
    try {
        const url = new URL(request.url);
        const redirectPath = sanitizePostAuthRedirect(url.searchParams.get("redirect"));

        log.info("Login redirect initiated", { redirectPath });

        const appUrl = process.env.WEB_APP_URL || url.origin;
        const callbackUrl = new URL("/api/auth/callback", appUrl);
        callbackUrl.searchParams.set("redirect", redirectPath);

        const steamLoginUrl = getSteamLoginUrl(callbackUrl.toString());

        log.debug("Redirecting to Steam login", { callbackUrl: callbackUrl.toString(), appUrl });

        return NextResponse.redirect(steamLoginUrl);
    } catch (error) {
        log.error("Login redirect failed", error instanceof Error ? error : new Error(String(error)));
        return NextResponse.redirect(new URL("/login?error=login_failed", request.url));
    }
}
