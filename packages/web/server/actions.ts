import { createSafeActionClient } from "next-safe-action";

import {rateLimitAction} from "@/lib/auth/rate-limit";
import {getCurrentSession} from "@/lib/auth/session";
import {logger} from "@/lib/logger";

const actionClient = createSafeActionClient();

const logUnauthenticated = logger.child("server.actions:unauthenticated");
const logAuthenticated = logger.child("server.actions:authenticated");
const logAdmin = logger.child("server.actions:admin");

export const actionClientWithoutAuth = actionClient.use(async ({ next }) => {
    logUnauthenticated.debug("Unauthenticated action invoked — checking rate limit");

    const ratelimited = await rateLimitAction();

    if (ratelimited) {
        logUnauthenticated.warn("Action rate-limited", { reason: ratelimited.message });
        throw new Error(ratelimited.message);
    }

    logUnauthenticated.debug("Rate limit passed — proceeding");
    return await next();
});

export const actionClientWithAuth = actionClient.use(async ({ next }) => {
    logAuthenticated.debug("Authenticated action invoked — resolving session");

    const session = await getCurrentSession();

    if (!session?.user) {
        logAuthenticated.warn("Authenticated action rejected — no valid session");
        throw new Error("Not authorized. Please log in to perform this action.");
    }

    logAuthenticated.debug("Session verified — checking rate limit", { userId: session.user.id, username: session.user.username, role: session.user.role });

    const ratelimited = await rateLimitAction({ session });

    if (ratelimited) {
        logAuthenticated.warn("Action rate-limited", { reason: ratelimited.message, userId: session.user.id, username: session.user.username, role: session.user.role });
        throw new Error(ratelimited.message);
    }

    logAuthenticated.debug("Rate limit passed — proceeding", { userId: session.user.id, username: session.user.username, role: session.user.role });
    return next({ ctx: { user: session.user }});
});

export const actionClientWithAdmin = actionClient.use(async ({ next }) => {
    logAdmin.debug("Admin action invoked — resolving session");

    const session = await getCurrentSession();

    if (!session?.user) {
        logAdmin.warn("Admin action rejected — no valid session");
        throw new Error("Not authorized. Please log in to perform this action.");
    }

    if (session.user.role !== "ADMIN") {
        logAdmin.warn("Admin action rejected — insufficient permissions", { userId: session.user.id, username: session.user.username, role: session.user.role });
        throw new Error("Forbidden. Admin access is required.");
    }

    logAdmin.debug("Admin session verified — checking rate limit", { userId: session.user.id, username: session.user.username });

    const ratelimited = await rateLimitAction({ session });

    if (ratelimited) {
        logAdmin.warn("Admin action rate-limited", { reason: ratelimited.message, userId: session.user.id, username: session.user.username });
        throw new Error(ratelimited.message);
    }

    logAdmin.debug("Rate limit passed — proceeding", { userId: session.user.id, username: session.user.username });
    return next({ ctx: { user: session.user }});
});
