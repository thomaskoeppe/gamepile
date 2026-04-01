'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';

import { AdminUsersTable } from '@/components/admin/users-table';
import { LoadingIndicator } from '@/components/shared/loading-indicator';
import { Shimmer } from '@/components/shared/shimmer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useServerQuery } from '@/lib/hooks/use-server-query';
import { cn } from '@/lib/utils';
import { getAdminUsers } from '@/server/queries/admin';

function UsersSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Shimmer key={index} className="h-28" />
                ))}
            </div>
            <div className="space-y-3">
                <Shimmer className="h-10 w-full rounded-lg" />
                {Array.from({ length: 5 }).map((_, index) => (
                    <Shimmer key={index} className="h-16 w-full rounded-lg" />
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
        isValidating,
        mutate,
    } = useServerQuery(['admin-users-detail'], () => getAdminUsers());

    const error = usersResult?.success === false ? usersResult.error : null;
    const data = usersResult?.success ? usersResult.data : null;

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users</h1>
                        <p className="text-sm text-muted-foreground">
                            Manage user accounts, roles, and permissions across the platform
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
                    <UsersSkeleton />
                ) : error ? (
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <TriangleAlert className="size-10 text-destructive mb-4" />
                            <p className="text-sm font-medium mb-1">Failed to load users</p>
                            <p className="text-sm text-muted-foreground mb-6">{error}</p>

                            <Button variant="outline" size="sm" onClick={() => mutate()}>
                                <RefreshCw className="size-4 mr-1.5" />
                                Retry
                            </Button>
                        </CardContent>
                    </Card>
                ) : data ? (
                    <div
                        className={cn(
                            'relative transition-opacity duration-200',
                            isRevalidating && 'opacity-80'
                        )}
                    >
                        <AdminUsersTable data={data} onMutate={() => mutate()} />
                    </div>
                ) : null}
            </div>

            <LoadingIndicator show={isRevalidating} />
        </>
    );
}
