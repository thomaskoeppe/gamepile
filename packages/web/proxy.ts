import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
    authEndpointLimiter,
    consumeRateLimit,
    getClientIp,
    globalAnonLimiter,
    globalAuthLimiter,
} from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { CollectionVisibility } from "@/prisma/generated/enums";

const log = logger.child("server.middleware:proxy");

const PUBLIC_ROUTES = [
    "/api/auth/callback",
    "/api/auth/signin",
    "/api/session",
];

/**
 * Route prefixes that allow unauthenticated access.
 * Access control is handled at the page / action level
 * (e.g. only PUBLIC collections are readable by anonymous users).
 */
const PUBLIC_ROUTE_PREFIXES = [
    "/collections/p/",
];

/**
 * Matches `/collections/<id>` but NOT `/collections`, `/collections/p/…`,
 * or any deeper sub-path like `/collections/<id>/edit`.
 */
const COLLECTION_DETAIL_RE = /^\/collections\/([^/]+)$/;

const AUTH_ROUTES = ["/"];

/**
 * Next.js middleware that handles rate limiting, session validation, CSP headers,
 * and route protection (redirecting unauthenticated users to the login page).
 */
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const reqLog = log.child("proxy", { pathname, method: request.method });

    const clientIp = getClientIp(request);
    const sessionCookieName = process.env.WEB_SESSION_COOKIE_NAME || "__session";
    const sessionToken = request.cookies.get(sessionCookieName)?.value;
    const hasSession = !!sessionToken;

    reqLog.debug("Proxy request received", {
        clientIp,
        hasSession,
        userAgent: request.headers.get("user-agent") ?? "unknown",
    });

    const start = Date.now();

    const isAuthEndpoint =
        pathname.startsWith("/api/auth/callback") ||
        pathname.startsWith("/api/auth/signin");

    if (isAuthEndpoint) {
        const rl = await consumeRateLimit(authEndpointLimiter, `ip:${clientIp}`);
        if (!rl.success) {
            reqLog.warn("Auth rate limit exceeded", {
                clientIp,
                retryAfterMs: rl.retryAfterMs,
                limiter: "authEndpoint",
                durationMs: Date.now() - start,
            });
            return new NextResponse("Too many requests", {
                status: 429,
                headers: {
                    "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
                },
            });
        }
    }

    const globalLimiter = hasSession ? globalAuthLimiter : globalAnonLimiter;
    const globalKey = hasSession ? `session:${sessionToken}` : `ip:${clientIp}`;
    const globalRl = await consumeRateLimit(globalLimiter, globalKey);

    if (!globalRl.success) {
        reqLog.warn("Global rate limit exceeded", {
            clientIp,
            hasSession,
            retryAfterMs: globalRl.retryAfterMs,
            limiter: hasSession ? "globalAuth" : "globalAnon",
            durationMs: Date.now() - start,
        });
        return new NextResponse("Too Many Requests", {
            status: 429,
            headers: {
                "Retry-After": String(Math.ceil(globalRl.retryAfterMs / 1000)),
            },
        });
    }

    const csp = [
        `default-src 'self'`,
        `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data: blob: https://avatars.steamstatic.com https://steamcdn-a.akamaihd.net https://cdn.cloudflare.steamstatic.com https://shared.akamai.steamstatic.com https://placehold.co`,
        `connect-src 'self' https://vitals.vercel-insights.com https://video.akamai.steamstatic.com`,
        `media-src 'self' data: blob: https://video.akamai.steamstatic.com`,
        `font-src 'self'`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
        `frame-ancestors 'none'`,
        // `upgrade-insecure-requests`,
    ].join(";");

    const requestHeaders = new Headers(request.headers);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);

    const isPublicRoute = PUBLIC_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(route + "/"),
    );
    const isPublicPrefixRoute = PUBLIC_ROUTE_PREFIXES.some(
        (prefix) => pathname.startsWith(prefix),
    );
    const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);
    const isProtectedRoute = !isPublicRoute && !isPublicPrefixRoute && !isAuthRoute;

    reqLog.debug("Route classification", {
        isPublicRoute,
        isPublicPrefixRoute,
        isAuthRoute,
        isProtectedRoute,
    });

    if (isProtectedRoute) {
        reqLog.debug("Accessing protected route", { hasSession });

        if (!sessionToken) {
            const collectionMatch = pathname.match(COLLECTION_DETAIL_RE);

            if (collectionMatch) {
                const collectionId = collectionMatch[1];
                try {
                    const collection = await prisma.collection.findUnique({
                        where: { id: collectionId },
                        select: { type: true },
                    });
                    if (collection?.type === CollectionVisibility.PUBLIC) {
                        reqLog.info("Redirecting to public collection view", { collectionId, durationMs: Date.now() - start });
                        return NextResponse.redirect(new URL(`/collections/p/${collectionId}`, request.nextUrl));

                    }
                } catch (err) {
                    reqLog.error("Failed to check public collection status", err instanceof Error ? err : undefined, {
                        collectionId,
                    });
                }
            }

            reqLog.info("No session — redirecting to login", { redirectTarget: pathname, durationMs: Date.now() - start });

            const loginUrl = new URL("/", request.nextUrl);
            loginUrl.searchParams.set("redirect", pathname);

            reqLog.info("Redirecting to login page", { loginUrl: loginUrl.toString() });

            return NextResponse.redirect(loginUrl);
        }

        if (pathname.startsWith("/api/")) {
            reqLog.debug("Forwarding API request with session token");
            requestHeaders.set("x-session-token", sessionToken);
            return NextResponse.next({ request: { headers: requestHeaders } });
        }
    }

    if (isAuthRoute && sessionToken) {
        reqLog.info("Authenticated user on auth route — redirecting to /library", { durationMs: Date.now() - start });
        return NextResponse.redirect(new URL("/library", request.nextUrl));
    }

    reqLog.debug("Proxy pass-through", { durationMs: Date.now() - start });
    return response;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
    ],
};