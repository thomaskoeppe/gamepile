"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { browserLog } from "@/lib/browser-logger";

/**
 * Route-segment error boundary. Catches render and data-fetching errors thrown
 * below the root layout so the user gets a recoverable page instead of a bare
 * `Internal Server Error` response body.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        browserLog.error("Unhandled render error", error, {
            digest: error.digest,
            namespace: "app.error",
        });
    }, [error]);

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
            <AlertTriangle className="size-12 text-destructive" aria-hidden />

            <div className="space-y-2">
                <h1 className="font-heading text-2xl font-semibold">Something went wrong</h1>
                <p className="max-w-md text-sm text-muted-foreground">
                    This page failed to load. The error has been logged — you can retry, and if it keeps happening the
                    server logs will have the details.
                </p>
                {error.digest ? (
                    <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
                ) : null}
            </div>

            <div className="flex gap-3">
                <Button onClick={reset}>Try again</Button>
                <Button
                    variant="outline"
                    onClick={() => {
                        window.location.href = "/library";
                    }}
                >
                    Back to library
                </Button>
            </div>
        </div>
    );
}
