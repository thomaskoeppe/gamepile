'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';

import { AdminInviteCodesPanel } from '@/components/admin/invite-codes/panel';
import { LoadingIndicator } from '@/components/shared/loading-indicator';
import { Shimmer } from '@/components/shared/shimmer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useServerQuery } from '@/lib/hooks/use-server-query';
import { cn } from '@/lib/utils';
import { getInviteCodes } from '@/server/queries/invite-codes';

function InviteCodesSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Shimmer key={index} className="h-28 rounded-lg" />
                ))}
            </div>
            <Shimmer className="h-24 w-full rounded-lg" />
            <div className="space-y-3">
                <Shimmer className="h-10 w-full rounded-lg" />
                {Array.from({ length: 4 }).map((_, index) => (
                    <Shimmer key={index} className="h-14 w-full rounded-lg" />
                ))}
            </div>
        </div>
    );
}

export default function AdminInviteCodesPage() {
    const {
        data: inviteCodesResult,
        isInitialLoading,
        isRevalidating,
        isValidating,
        mutate,
    } = useServerQuery(['admin-invite-codes'], () => getInviteCodes());

    const error = inviteCodesResult?.success === false ? inviteCodesResult.error : null;
    const data = inviteCodesResult?.success ? inviteCodesResult.data : null;

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Invite Codes</h1>
                        <p className="text-sm text-muted-foreground">
                            Create and manage registration invite codes
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
                    <InviteCodesSkeleton />
                ) : error ? (
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <TriangleAlert className="size-10 text-destructive mb-4" />
                            <p className="text-sm font-medium mb-1">Failed to load invite codes</p>
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
                        <AdminInviteCodesPanel data={data} onMutate={() => mutate()} />
                    </div>
                ) : null}
            </div>

            <LoadingIndicator show={isRevalidating} />
        </>
    );
}
