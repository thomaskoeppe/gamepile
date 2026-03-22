export type QueryResult<T> =
    | { success: true; data: T }
    | { success: false; error: string };