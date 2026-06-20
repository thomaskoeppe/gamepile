"use client";

import { Ban, LoaderCircle } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { browserLog } from "@/lib/browser-logger";
import { cn } from "@/lib/utils";
import { cancelAdminJob } from "@/server/actions/admin";

/**
 * Admin control that cancels a queued or running background job after
 * confirmation. The worker observes the cancellation cooperatively and stops
 * the job at its next checkpoint.
 */
export function CancelJobButton({
    jobId,
    compact = false,
    onCanceledAction,
}: {
    jobId: string;
    /** Render an icon-only trigger (for dense table rows). */
    compact?: boolean;
    /** Called after the job is successfully canceled (e.g. to refresh a list). */
    onCanceledAction?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cancelAction = useAction(cancelAdminJob, {
        onSuccess: () => {
            browserLog.info("Job canceled", { jobId });
            setOpen(false);
            onCanceledAction?.();
        },
        onError: ({ error: actionError }) => {
            setError(actionError.serverError ?? "Failed to cancel job.");
        },
    });

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) setError(null);
    };

    return (
        <>
            {compact ? (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setOpen(true)}
                    aria-label="Cancel job"
                >
                    <Ban className="h-3.5 w-3.5" />
                </Button>
            ) : (
                <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setOpen(true)}
                >
                    <Ban className="h-4 w-4 mr-1.5" />
                    Cancel job
                </Button>
            )}

            <AlertDialog open={open} onOpenChange={handleOpenChange}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel this job?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The job will stop at its next checkpoint and be marked as canceled.
                            Work already completed is kept; remaining items are not processed.
                            This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={cancelAction.isPending}>
                            Keep running
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault();
                                setError(null);
                                cancelAction.execute({ jobId });
                            }}
                            disabled={cancelAction.isPending}
                            className={cn(
                                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                            )}
                        >
                            {cancelAction.isPending ? (
                                <>
                                    <LoaderCircle className="h-4 w-4 mr-1.5 animate-spin" />
                                    Canceling…
                                </>
                            ) : (
                                "Cancel job"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
