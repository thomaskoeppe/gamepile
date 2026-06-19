"use client";

import { Gift, LoaderCircle } from "lucide-react";
import Link from "next/link";

import { Header } from "@/components/header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import { getSharedWithMe } from "@/server/queries/vault-shares";

function initials(username: string): string {
    return username.split(" ").map((n) => n[0]).join("").toUpperCase();
}

export default function SharedWithMePage() {
    const { user } = useSession();
    const { data, isLoading } = useServerQuery(
        user ? ["shared-with-me", user.id] : null,
        () => getSharedWithMe(),
    );

    const shares = data?.success ? data.data : [];

    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6">
                <h1 className="text-xl font-semibold mb-4">Shared with me</h1>

                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <LoaderCircle className="size-8 animate-spin text-muted-foreground" />
                    </div>
                ) : shares.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
                        <Gift className="size-10" />
                        <p>No vaults have been shared with you yet.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {shares.map((share) => (
                            <Link key={share.shareId} href={`/vaults/shared/${share.shareId}`} className="group">
                                <Card className="h-full bg-card border-border transition-all hover:border-primary/40 hover:shadow-md">
                                    <CardHeader>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <CardTitle className="truncate">{share.vaultName}</CardTitle>
                                                <CardDescription>
                                                    {share.gameCount === 0 ? "All keys" : `${share.gameCount} key(s)`}
                                                </CardDescription>
                                            </div>
                                            <Badge variant={share.mode === "DIRECT" ? "default" : "secondary"}>
                                                {share.mode === "DIRECT" ? "Direct" : "Request"}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Avatar className="h-6 w-6">
                                                <AvatarImage src={share.owner.avatarUrl || "/placeholder.svg"} alt={share.owner.username} />
                                                <AvatarFallback className="text-xs">{initials(share.owner.username)}</AvatarFallback>
                                            </Avatar>
                                            Shared by {share.owner.username}
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
