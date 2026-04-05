'use client';

import { RefreshCw, TriangleAlert } from "lucide-react";

import { AdminVaultsTable } from "@/components/admin/vaults-table";
import { LoadingIndicator } from "@/components/shared/loading-indicator";
import { Shimmer } from "@/components/shared/shimmer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { cn } from "@/lib/utils";
import { getAdminVaults, getAllUsers } from "@/server/queries/admin";

function VaultsSkeleton() {
    return (
        <div className="space-y-3">
            <Shimmer className="h-10 w-full rounded-lg" />
            {Array.from({ length: 6 }).map((_, i) => (
                <Shimmer key={i} className="h-16 w-full rounded-lg" />
            ))}
        </div>
    );
}

export default function AdminVaultsPage() {
    const {
        data: vaultsResult,
        isInitialLoading,
        isRevalidating,
        isValidating,
        mutate,
    } = useServerQuery(["admin-vaults"], () => getAdminVaults());

    const { data: usersResult } = useServerQuery(["admin-users"], () => getAllUsers());

    const error = vaultsResult?.success === false ? vaultsResult.error : null;
    const vaults = vaultsResult?.success ? vaultsResult.data : null;
    const users = usersResult?.success ? usersResult.data : [];

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            Vaults
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            View all vaults and manage ownership assignments
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
                    <VaultsSkeleton />
                ) : error ? (
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <TriangleAlert className="size-10 text-destructive mb-4" />
                            <p className="text-sm font-medium mb-1">Failed to load vaults</p>
                            <p className="text-sm text-muted-foreground mb-6">{error}</p>

                            <Button variant="outline" size="sm" onClick={() => mutate()}>
                                <RefreshCw className="size-4 mr-1.5" />
                                Retry
                            </Button>
                        </CardContent>
                    </Card>
                ) : vaults ? (
                    <div className={cn("relative transition-opacity duration-200", isRevalidating && "opacity-80")}>
                        <AdminVaultsTable
                            vaults={vaults}
                            users={users}
                            onMutate={() => mutate()}
                        />
                    </div>
                ) : null}
            </div>

            <LoadingIndicator show={isRevalidating} />
        </>
    );
}
