"use client";

import { LoaderCircle } from "lucide-react";

import { AdminCollectionsTable } from "@/components/admin/admin-collections-table";
import { LoadingIndicator } from "@/components/loading-indicator";
import { Shimmer } from "@/components/shimmer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { cn } from "@/lib/utils";
import { getAdminCollections, getAllUsers } from "@/server/queries/admin";

function CollectionsSkeleton() {
    return (
        <div className="space-y-3">
            <Shimmer className="h-10 w-full" />
            {Array.from({ length: 6 }).map((_, i) => (
                <Shimmer key={i} className="h-16 w-full" />
            ))}
        </div>
    );
}

export default function AdminCollectionsPage() {
    const {
        data: collectionsResult,
        isInitialLoading,
        isRevalidating,
        mutate,
    } = useServerQuery(["admin-collections"], () => getAdminCollections());

    const { data: usersResult } = useServerQuery(["admin-users"], () => getAllUsers());

    const error = collectionsResult?.success === false ? collectionsResult.error : null;
    const collections = collectionsResult?.success ? collectionsResult.data : null;
    const users = usersResult?.success ? usersResult.data : [];

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Collections
                </h1>
                <p className="text-sm text-muted-foreground">
                    Review all collections and manage owner assignments from the admin console.
                </p>
            </div>

            {isInitialLoading ? (
                <CollectionsSkeleton />
            ) : error ? (
                <Alert variant="destructive">
                    <AlertTitle>Failed to load collections</AlertTitle>
                    <AlertDescription className="space-y-3">
                        <p>{error}</p>
                        <Button type="button" variant="outline" onClick={() => mutate()}>
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : collections ? (
                <div className={cn("relative transition-opacity duration-200", isRevalidating && "opacity-80")}>
                    {isRevalidating && (
                        <div className="absolute right-0 top-0 z-10">
                            <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/80 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
                                <LoaderCircle className="size-3 animate-spin" />
                                <span>Updating</span>
                            </div>
                        </div>
                    )}
                    <AdminCollectionsTable collections={collections} users={users} onMutate={() => mutate()} />
                </div>
            ) : null}

            <LoadingIndicator show={isRevalidating} />
        </div>
    );
}
