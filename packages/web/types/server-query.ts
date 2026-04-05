export type QueryResult<T> = { success: true; data: T } | { success: false; error: string };

export type AuthContext = { user: { id: string } };

export type Handler<TInput, TOutput, TCtx> = (input: { parsedInput: TInput; ctx: TCtx }) => Promise<TOutput>;