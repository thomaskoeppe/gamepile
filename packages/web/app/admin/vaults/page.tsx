"use client";

import { LoaderCircle } from "lucide-react";

import { AdminVaultsTable } from "@/components/admin/admin-vaults-table";
import { LoadingIndicator } from "@/components/loading-indicator";
import { Shimmer } from "@/components/shimmer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { cn } from "@/lib/utils";
import { getAdminVaults, getAllUsers } from "@/server/queries/admin";

function VaultsSkeleton() {
    return (
        <div className="space-y-3">
            <Shimmer className="h-10 w-full" />
            {Array.from({ length: 6 }).map((_, i) => (
                <Shimmer key={i} className="h-16 w-full" />
            ))}
        </div>
    );
}

export default function AdminVaultsPage() {
    const {
        data: vaultsResult,
        isInitialLoading,
        isRevalidating,
        mutate,
    } = useServerQuery(["admin-vaults"], () => getAdminVaults());

    const { data: usersResult } = useServerQuery(["admin-users"], () => getAllUsers());

    const error = vaultsResult?.success === false ? vaultsResult.error : null;
    const vaults = vaultsResult?.success ? vaultsResult.data : null;
    const users = usersResult?.success ? usersResult.data : [];

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Vaults
                </h1>
                <p className="text-sm text-muted-foreground">
                    Review all vaults and manage owner assignments from the admin console.
                </p>
            </div>

            {isInitialLoading ? (
                <VaultsSkeleton />
            ) : error ? (
                <Alert variant="destructive">
                    <AlertTitle>Failed to load vaults</AlertTitle>
                    <AlertDescription className="space-y-3">
                        <p>{error}</p>
                        <Button type="button" variant="outline" onClick={() => mutate()}>
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : vaults ? (
                <div className={cn("relative transition-opacity duration-200", isRevalidating && "opacity-80")}>
                    {isRevalidating && (
                        <div className="absolute right-0 top-0 z-10">
                            <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/80 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
                                <LoaderCircle className="size-3 animate-spin" />
                                <span>Updating</span>
                            </div>
                        </div>
                    )}
                    <AdminVaultsTable vaults={vaults} users={users} onMutate={() => mutate()} />
                </div>
            ) : null}

            <LoadingIndicator show={isRevalidating} />
        </div>
    );
}
