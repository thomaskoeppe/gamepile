"use client";

import { LoaderCircle } from "lucide-react";

import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { Shimmer } from "@/components/shimmer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { cn } from "@/lib/utils";
import { getAdminUsers } from "@/server/queries/admin";

function UsersSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Shimmer key={index} className="h-28" />
                ))}
            </div>
            <div className="space-y-3">
                <Shimmer className="h-10 w-full" />
                {Array.from({ length: 5 }).map((_, index) => (
                    <Shimmer key={index} className="h-16 w-full" />
                ))}
            </div>
        </div>
    );
}

export default function AdminUsersPage() {
    const {
        data: usersResult,
        isInitialLoading,
        isRevalidating,
        mutate,
    } = useServerQuery(["admin-users-detail"], () => getAdminUsers());

    const error = usersResult?.success === false ? usersResult.error : null;
    const data = usersResult?.success ? usersResult.data : null;

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users</h1>
                <p className="text-sm text-muted-foreground">
                    Monitor account details, privacy preferences, resource ownership, and invite-code onboarding activity.
                </p>
            </div>

            {isInitialLoading ? (
                <UsersSkeleton />
            ) : error ? (
                <Alert variant="destructive">
                    <AlertTitle>Failed to load admin users</AlertTitle>
                    <AlertDescription className="space-y-3">
                        <p>{error}</p>
                        <Button type="button" variant="outline" onClick={() => mutate()}>
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : data ? (
                <div
                    className={cn(
                        "relative transition-opacity duration-200",
                        isRevalidating && "opacity-80",
                    )}
                >
                    {isRevalidating && (
                        <div className="absolute right-0 top-0 z-10">
                            <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/80 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
                                <LoaderCircle className="size-3 animate-spin" />
                                <span>Updating</span>
                            </div>
                        </div>
                    )}
                    <AdminUsersTable data={data} />
                </div>
            ) : null}
        </div>
    );
}

