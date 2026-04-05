'use client';

import { RefreshCw, TriangleAlert } from "lucide-react";

import { ConfigurationForm } from "@/components/admin/configuration-form";
import { LoadingIndicator } from "@/components/shared/loading-indicator";
import { Shimmer } from "@/components/shared/shimmer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { getAdminConfiguration } from "@/server/queries/admin";

function ConfigurationSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 12 }).map((_, i) => (
                <Shimmer key={i} className="h-18 w-full rounded-lg" />
            ))}
        </div>
    );
}

export default function AdminConfigurationPage() {
    const {
        data: configResult,
        isInitialLoading,
        isRevalidating,
        isValidating,
        mutate,
    } = useServerQuery(
        ["admin-configuration"],
        () => getAdminConfiguration()
    );

    const error = configResult?.success === false ? configResult.error : null;
    const settings = configResult?.success ? configResult.data : null;

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            Configuration
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Manage platform settings, feature flags, and resource limits
                        </p>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => mutate()}
                        disabled={isValidating || isInitialLoading}
                    >
                        {isValidating || isInitialLoading ? (
                            <>
                                <RefreshCw className="size-4 animate-spin mr-2" />
                                Refreshing
                            </>
                        ) : (
                            <>
                                <RefreshCw className="size-4 mr-2" />
                                Refresh
                            </>
                        )}
                    </Button>
                </div>

                {isInitialLoading ? (
                    <ConfigurationSkeleton />
                ) : error ? (
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <TriangleAlert className="size-10 text-destructive mb-4" />
                            <p className="text-sm font-medium mb-1">Failed to load configuration</p>
                            <p className="text-sm text-muted-foreground mb-6">{error}</p>

                            <Button variant="outline" size="sm" onClick={() => mutate()}>
                                <RefreshCw className="size-4 mr-1.5" />
                                Retry
                            </Button>
                        </CardContent>
                    </Card>
                ) : settings ? (
                    <ConfigurationForm settings={settings} onSaved={() => mutate()} />
                ) : null}
            </div>

            <LoadingIndicator show={isRevalidating} />
        </>
    );
}
