/**
 * Shared helpers for route-handler tests.
 */

/** Builds a real `Request`, so handlers exercise genuine parsing and headers. */
export function makeRequest(url = "http://localhost:3000/", init: RequestInit & { requestId?: string } = {}): Request {
    const { requestId, ...rest } = init;
    const headers = new Headers(rest.headers);

    if (requestId) {
        headers.set("x-request-id", requestId);
    }

    return new Request(url, { ...rest, headers });
}

/** Wraps a value in the `{ params: Promise<...> }` shape Next.js passes to handlers. */
export function routeContext<T extends Record<string, string>>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}
