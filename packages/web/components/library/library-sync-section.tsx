"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";

import { JobStatusCard } from "@/components/job-status";
import { Button } from "@/components/ui/button";
import { browserLog } from "@/lib/browser-logger";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { JobType } from "@/prisma/generated/browser";
import { resyncLibrary } from "@/server/actions/library";
import { getLibrarySyncStatus } from "@/server/queries/library";

dayjs.extend(relativeTime);

/**
 * Library sync controls: shows when the library was last synced, a button to
 * trigger a manual re-sync (with server-enforced cooldown), and live progress
 * cards for the import and achievements jobs.
 */
export function LibrarySyncSection({ userId }: { userId: string }) {
    // Remounts the job status cards so a freshly queued job's SSE stream opens
    // immediately instead of waiting for the 30s re-poll.
    const [nonce, setNonce] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const { data: statusResult, mutate } = useServerQuery(
        ["library-sync-status", userId], () => getLibrarySyncStatus(),
    );
    const status = statusResult?.success ? statusResult.data : null;

    const resyncAction = useAction(resyncLibrary, {
        onSuccess: () => {
            browserLog.info("Library re-sync queued");
            setError(null);
            setNonce((n) => n + 1);
            void mutate();
        },
        onError: ({ error: actionError }) => {
            setError(actionError.serverError ?? "Failed to start library sync.");
        },
    });

    const now = Date.now();
    const coolingDown = !!status?.nextAllowedAt && new Date(status.nextAllowedAt).getTime() > now;
    const disabled =
        resyncAction.isPending ||
        !status ||
        status.syncInProgress ||
        coolingDown;

    return (
        <div className="space-y-3 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-medium">Steam library</h2>
                    <p className="text-xs text-muted-foreground">
                        {status?.lastSyncedAt
                            ? `Last synced ${dayjs(status.lastSyncedAt).fromNow()}`
                            : "Not synced yet"}
                        {coolingDown && status?.nextAllowedAt && (
                            <> · next sync available {dayjs(status.nextAllowedAt).fromNow()}</>
                        )}
                    </p>
                </div>

                <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => resyncAction.execute()}
                >
                    {resyncAction.isPending || status?.syncInProgress ? (
                        <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                        <RefreshCw className="size-4" />
                    )}
                    {status?.syncInProgress ? "Syncing…" : "Sync library"}
                </Button>
            </div>

            {error && (
                <p className="text-xs text-destructive">{error}</p>
            )}

            <JobStatusCard key={`lib-${nonce}`} jobType={JobType.IMPORT_USER_LIBRARY} />
            <JobStatusCard key={`ach-${nonce}`} jobType={JobType.IMPORT_USER_ACHIEVEMENTS} hideWhenEmpty />
        </div>
    );
}
