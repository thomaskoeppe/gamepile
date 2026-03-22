import useSWR, { type SWRConfiguration } from "swr";

import { type QueryResult } from "@/types/server-query";

/**
 * SWR-based data-fetching hook for server queries that adds derived loading state
 * helpers on top of the standard SWR return value.
 *
 * @param key - SWR cache key. Pass an array for composite keys, a string for simple
 *   keys, or `null` to disable fetching (e.g. when a required value is not yet known).
 * @param fetcher - Async function that resolves to a {@link QueryResult}<T>. Called by
 *   SWR whenever the cache key changes or a revalidation is triggered.
 * @param config - Optional SWR configuration overrides. Merged on top of the defaults:
 *   `revalidateOnFocus=true`, `dedupingInterval=2000`, `shouldRetryOnError=false`,
 *   `keepPreviousData=true`.
 * @returns The standard SWR result extended with two additional booleans:
 *   - `isInitialLoading` — `true` only on the very first load when no cached data is
 *     available yet; use this to render a full skeleton placeholder.
 *   - `isRevalidating` — `true` when SWR is refreshing data in the background while
 *     stale data is already present; use this to render an "Updating" indicator.
 */
export function useServerQuery<T>(
    key: string | readonly unknown[] | null,
    fetcher: () => Promise<QueryResult<T>>,
    config?: SWRConfiguration<QueryResult<T>>
) {
    const swr = useSWR<QueryResult<T>>(key, fetcher, {
        revalidateOnFocus: true,
        dedupingInterval: 2000,
        shouldRetryOnError: false,
        keepPreviousData: true,
        ...config,
    });

    const isInitialLoading = swr.isLoading && !swr.data;
    const isRevalidating = swr.isValidating && !!swr.data;

    return {
        ...swr,
        /** True only on first load when no data is available yet */
        isInitialLoading,
        /** True when revalidating in the background (focus, interval, manual mutate) */
        isRevalidating,
    };
}