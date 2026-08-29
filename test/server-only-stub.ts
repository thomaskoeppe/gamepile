/**
 * Stand-in for the `server-only` package under test. The real module throws when
 * it is imported outside a React Server Component, which would break any test
 * that reaches a module importing it (e.g. `lib/queue.ts`).
 */
export {};
