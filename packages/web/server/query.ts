import { z } from "zod";

import {rateLimitAction, rateLimitPublic} from "@/lib/auth/rate-limit";
import { getCurrentSession } from "@/lib/auth/session";
import {logger} from "@/lib/logger";

type QueryResult<T> =
    | { success: true; data: T; }
    | { success: false, error: string; };

type AuthContext = { user: { id: string } };
type Handler<TInput, TOutput, TCtx> = (input: { parsedInput: TInput; ctx: TCtx }) => Promise<TOutput>;

const log = logger.child("server.queries");

/**
 * Internal factory that wires together Zod input validation, authentication context
 * resolution, rate limiting, and error handling into a single server-callable function.
 *
 * @param schema - Zod schema for input validation, or `null` for no-input queries.
 * @param handler - The query implementation receiving validated input and resolved context.
 * @param getCtx - Async function that resolves the auth context or returns an error result.
 * @param label - Human-readable label stamped on log records for this query.
 * @returns An async function that accepts raw input and returns a {@link QueryResult}.
 */
function createQueryClient<TInput, TOutput, TCtx extends AuthContext | void>(
    schema: z.ZodType<TInput> | null,
    handler: Handler<TInput, TOutput, TCtx>,
    getCtx: () => Promise<TCtx | QueryResult<never>>,
    label: string = "unknown",
) {
    return async (raw?: TInput): Promise<QueryResult<TOutput>> => {
        log.debug("Received query request", { label, raw });

        try {
            let parsedData: TInput | undefined;

            if (schema) {
                const parsed = schema.safeParse(raw);
                if (!parsed.success) {
                    const validationErrors = parsed.error.issues.map((i) => ({
                        path: i.path.join("."),
                        message: i.message,
                        code: i.code,
                    }));
                    log.warn("Input validation failed", { label, errors: validationErrors });
                    return {
                        success: false,
                        error: parsed.error.issues.map((i) => i.message).join(", ")
                    };
                }
                parsedData = parsed.data;
            }

            const ctx = await getCtx();
            if (ctx !== undefined && "success" in ctx) {
                const failedCtx = ctx as QueryResult<never> & { success: false };
                log.warn("Context resolution failed", { label, error: failedCtx.error });
                return ctx;
            }

            const data = await handler({ parsedInput: parsedData as TInput, ctx: ctx as TCtx });
            log.debug("Query executed successfully", { label, data });

            return { success: true, data };
        } catch (err) {
            log.error("Error executing query", err instanceof Error ? err : new Error(String(err)), { label });
            return { success: false, error: "An unexpected error occurred." };
        }
    };
}

export const queryClientWithAuth = {
    inputSchema: <TInput>(schema: z.ZodType<TInput>) => ({
        query: <TOutput>(handler: Handler<TInput, TOutput, AuthContext>) =>
            createQueryClient(schema, handler, async () => {
                const session = await getCurrentSession();
                if (!session?.user) {
                    return { success: false, error: "Not authorized." } as const;
                }

                const ratelimited = await rateLimitAction({ session });
                if (ratelimited) {
                    return { success: false, error: ratelimited.message } as const;
                }

                return { user: session.user };
            }, "queryClientWithAuth"),
    }),
    query: <TOutput>(handler: Handler<void, TOutput, AuthContext>) =>
        createQueryClient(null, handler, async () => {
            const session = await getCurrentSession();
            if (!session?.user) {
                return { success: false, error: "Not authorized." } as const;
            }

            const ratelimited = await rateLimitAction({ session });
            if (ratelimited) {
                return { success: false, error: ratelimited.message } as const;
            }

            return { user: session.user };
        }, "queryClientWithAuth"),
};

export const queryClientWithoutAuth = {
    inputSchema: <TInput>(schema: z.ZodType<TInput>) => ({
        query: <TOutput>(handler: Handler<TInput, TOutput, void>) =>
            createQueryClient(schema, handler, async () => {
                const ratelimited = await rateLimitPublic();

                if (ratelimited) {
                    return { success: false, error: ratelimited.message } as const;
                }

                return undefined as void;
            }, "queryClientWithoutAuth"),
    }),
    query: <TOutput>(handler: Handler<void, TOutput, void>) =>
        createQueryClient(null, handler, async () => undefined as void, "queryClientWithoutAuth"),
};

export const queryClientWithAdmin = {
    inputSchema: <TInput>(schema: z.ZodType<TInput>) => ({
        query: <TOutput>(handler: Handler<TInput, TOutput, AuthContext>) =>
            createQueryClient(schema, handler, async () => {
                const session = await getCurrentSession();
                if (!session?.user) {
                    return { success: false, error: "Not authorized." } as const;
                }

                if (session.user.role !== "ADMIN") {
                    return { success: false, error: "Forbidden. Admin access is required." } as const;
                }

                const ratelimited = await rateLimitAction({ session });
                if (ratelimited) {
                    return { success: false, error: ratelimited.message } as const;
                }

                return { user: session.user };
            }, "queryClientWithAdmin"),
    }),
    query: <TOutput>(handler: Handler<void, TOutput, AuthContext>) =>
        createQueryClient(null, handler, async () => {
            const session = await getCurrentSession();
            if (!session?.user) {
                return { success: false, error: "Not authorized." } as const;
            }

            if (session.user.role !== "ADMIN") {
                return { success: false, error: "Forbidden. Admin access is required." } as const;
            }

            const ratelimited = await rateLimitAction({ session });
            if (ratelimited) {
                return { success: false, error: ratelimited.message } as const;
            }

            return { user: session.user };
        }, "queryClientWithAdmin"),
};
