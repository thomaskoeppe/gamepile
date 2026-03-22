/**
 * lib/with-logging.ts
 *
 * Higher-order function that wraps a next-safe-action handler to inject a
 * namespaced logger as a second argument.
 */

import { type ILogger, type LogContext,logger } from '@/lib/logger';

/** Options accepted by withLogging. */
export interface WithLoggingOptions {
    /**
     * Dot-colon notation namespace stamped on every log record produced inside
     * the wrapped handler.
     *
     * Convention: `"<runtime>.<layer>.<module>:<action>"`
     * e.g. `"server.actions.admin:saveConfiguration"`
     */
    namespace: string

    /**
     * Optional extra fields merged into every log record alongside the namespace.
     * Useful for static metadata that applies to all calls (e.g. { version: 2 }).
     */
    baseContext?: LogContext
}

/** The helpers object injected as the second argument of the wrapped handler. */
interface LoggingHelpers {
    /** A logger pre-scoped to the action's namespace. */
    log: ILogger
}

/**
 * Shape of the first argument that next-safe-action passes to `.action()`
 * handlers.  Typed generically so withLogging stays framework-agnostic —
 * the concrete `parsedInput` / `ctx` types flow through from the call site.
 */
type ActionArgs<TInput, TCtx> = {
    parsedInput: TInput
    ctx: TCtx
    [key: string]: unknown
}

/** The handler signature that next-safe-action expects. */
type ActionHandler<TInput, TCtx, TReturn> = (
    args: ActionArgs<TInput, TCtx>,
) => Promise<TReturn>

/** The inner handler signature that you write — receives the injected helpers. */
type WrappedHandler<TInput, TCtx, TReturn> = (
    args: ActionArgs<TInput, TCtx>,
    helpers: LoggingHelpers,
) => Promise<TReturn>

/**
 * Wrap a next-safe-action handler with automatic namespace-scoped logging.
 *
 * The wrapper:
 *   1. Creates a child logger scoped to `options.namespace`.
 *   2. Injects it as `{ log }` in the second argument of your handler.
 *   3. Catches any unhandled exception, logs it at `error` level with the
 *      full Error object, then re-throws so next-safe-action can handle it.
 *
 * The returned function matches the single-argument signature that
 * `.action()` expects, so you can pass it directly.
 *
 * @example
 *   .action(withLogging(async ({ parsedInput, ctx }, { log }) => {
 *     log.info("Processing", { userId: ctx.user.id })
 *     …
 *   }, { namespace: "server.actions.orders:create" }))
 */
export function withLogging<TInput, TCtx, TReturn>(
    handler: WrappedHandler<TInput, TCtx, TReturn>,
    options: WithLoggingOptions,
): ActionHandler<TInput, TCtx, TReturn> {
    const { namespace, baseContext } = options;

    const log = logger.child(namespace, baseContext);

    return async function wrappedAction(
        args: ActionArgs<TInput, TCtx>,
    ): Promise<TReturn> {
        try {
            return await handler(args, { log });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));

            log.error(
                `Unhandled error in action [${namespace}]`,
                error,
                { input: args.parsedInput as LogContext },
            );

            throw err;
        }
    };
}