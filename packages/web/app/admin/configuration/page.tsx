"use client";

import { ConfigurationForm } from "@/components/admin/configuration-form";
import { LoadingIndicator } from "@/components/loading-indicator";
import { Shimmer } from "@/components/shimmer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { getAdminConfiguration } from "@/server/queries/admin";

function ConfigurationSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 12 }).map((_, i) => (
                <Shimmer key={i} className="h-18 w-full" />
            ))}
        </div>
    );
}

export default function AdminConfigurationPage() {
    const {
        data: configResult,
        isInitialLoading,
        isRevalidating,
        mutate,
    } = useServerQuery(
        ["admin-configuration"],
        () => getAdminConfiguration()
    );

    const error = configResult?.success === false ? configResult.error : null;
    const settings = configResult?.success ? configResult.data : null;

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Configuration
                </h1>
                <p className="text-sm text-muted-foreground">
                    Manage platform defaults and onboarding controls.
                </p>
            </div>

            {isInitialLoading ? (
                <ConfigurationSkeleton />
            ) : error ? (
                <Alert variant="destructive">
                    <AlertTitle>Failed to load configuration</AlertTitle>
                    <AlertDescription className="space-y-3">
                        <p>{error}</p>
                        <Button type="button" variant="outline" onClick={() => mutate()}>
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : settings ? (
                <ConfigurationForm settings={settings} onSaved={() => mutate()} />
            ) : null}

            <LoadingIndicator show={isRevalidating} />
        </div>
    );
}
