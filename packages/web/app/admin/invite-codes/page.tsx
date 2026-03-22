"use client";

import { LoaderCircle } from "lucide-react";

import { AdminInviteCodesPanel } from "@/components/admin/admin-invite-codes-panel";
import { Shimmer } from "@/components/shimmer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { cn } from "@/lib/utils";
import { getInviteCodes } from "@/server/queries/invite-codes";

function InviteCodesSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Shimmer key={index} className="h-28" />
                ))}
            </div>
            <Shimmer className="h-24 w-full" />
            <div className="space-y-3">
                <Shimmer className="h-10 w-full" />
                {Array.from({ length: 4 }).map((_, index) => (
                    <Shimmer key={index} className="h-14 w-full" />
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
        mutate,
    } = useServerQuery(["admin-invite-codes"], () => getInviteCodes());

    const error = inviteCodesResult?.success === false ? inviteCodesResult.error : null;
    const data = inviteCodesResult?.success ? inviteCodesResult.data : null;

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Invite Codes</h1>
                <p className="text-sm text-muted-foreground">
                    Generate onboarding codes, review their usage, and inspect which users redeemed each code.
                </p>
            </div>

            {isInitialLoading ? (
                <InviteCodesSkeleton />
            ) : error ? (
                <Alert variant="destructive">
                    <AlertTitle>Failed to load invite codes</AlertTitle>
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
                    <AdminInviteCodesPanel data={data} onMutate={() => mutate()} />
                </div>
            ) : null}
        </div>
    );
}
