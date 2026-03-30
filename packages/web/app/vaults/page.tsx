'use client';

import {
    ArrowRight, Calendar, Gamepad2, Library, LoaderCircle,
    Lock, LockOpen, Plus, RefreshCcw, TriangleAlert, Users,
} from "lucide-react";
import Link from "next/link";

import { CreateVaultDialog } from "@/components/dialogs/create-vault";
import { Header } from "@/components/header";
import {LoadingIndicator} from "@/components/loading-indicator";
import {Shimmer} from "@/components/shimmer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription,CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import {cn} from "@/lib/utils";
import type {Prisma} from "@/prisma/generated/browser";
import { getVaults } from "@/server/queries/vaults";

function VaultCard({ vault, isOwner }: { vault: Prisma.KeyVaultGetPayload<{ include: { _count: { select: { games: true; users: true } } }, omit: { authHash: true, authSalt: true, keySalt: true, encryptedVaultKey: true, recoveryEncryptedVaultKey: true, recoveryKeyHash: true } }>; isOwner: boolean }) {
    return (
        <Link href={`/vaults/${vault.id}`} className="group">
            <Card className="h-full bg-card border-border transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5">
                <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1.5 min-w-0">
                            <CardTitle className="text-base truncate">{vault.name}</CardTitle>
                            <CardDescription>
                                {isOwner ? "Owned by you" : "Shared with you"}
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-xs capitalize gap-1">
                            {vault.authType === "NONE" ? (
                                <LockOpen className="size-3" />
                            ) : (
                                <Lock className="size-3" />
                            )}
                            {vault.authType.toLowerCase()}
                        </Badge>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                            <Gamepad2 className="size-4" />
                            <span>{vault._count.games} game{vault._count.games !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Users className="size-4" />
                            <span>{vault._count.users} member{vault._count.users !== 1 ? "s" : ""}</span>
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        <Calendar className="size-3.5" />
                        <span>
                            {new Date(vault.createdAt).toLocaleDateString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                            })}
                        </span>
                    </div>
                    <span className="flex items-center gap-1 group-hover:text-primary/80 transition-colors">
                        View
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                </CardFooter>
            </Card>
        </Link>
    );
}

export default function Page() {
    const { user, isLoading: sessionLoading } = useSession();

    const {
        data: result,
        isInitialLoading,
        isRevalidating,
        isValidating,
        mutate,
    } = useServerQuery(
        user ? ["vaults", user.id] : null,
        () => getVaults()
    );

    const isLoading = sessionLoading || isInitialLoading;
    const vaults = result?.success ? result.data : null;
    const error = result?.success === false ? result : null;

    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight">Your Vaults</h1>
                        <p className="text-sm text-muted-foreground">
                            Manage and access your key vaults
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <CreateVaultDialog onReload={() => mutate()}>
                            <Button variant="outline" disabled={isLoading}>
                                {!isLoading ? (
                                    <>
                                        <Plus className="size-4 mr-1.5" />
                                        Create Vault
                                    </>
                                ) : (
                                    <>
                                        <LoaderCircle className="size-4 animate-spin" />
                                        Create Vault
                                    </>
                                )}
                            </Button>
                        </CreateVaultDialog>

                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => mutate()}
                            disabled={isValidating || isLoading}
                        >
                            {isValidating || isLoading
                                ? <LoaderCircle className="size-4 animate-spin" />
                                : <RefreshCcw className="size-4" />
                            }
                        </Button>
                    </div>
                </div>

                {isLoading && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Shimmer key={i} className="h-48" />
                        ))}
                    </div>
                )}

                {error && (
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <TriangleAlert className="size-10 text-destructive mb-4" />
                            <p className="text-sm font-medium mb-1">Failed to load vaults</p>
                            <p className="text-sm text-muted-foreground mb-6">{error.error}</p>

                            <Button variant="outline" size="sm" onClick={() => mutate()}>
                                <RefreshCcw className="size-4 mr-1.5" />
                                Retry
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {!isLoading && !error && (!vaults || vaults.length === 0) && (
                    <Card className="bg-card border-border">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <Library className="size-10 text-muted-foreground mb-4" />
                            <p className="text-sm font-medium mb-1">No collections yet</p>
                            <p className="text-sm text-muted-foreground mb-6">
                                Create your first vault to organize your keys
                            </p>

                            <CreateVaultDialog onReload={() => mutate()}>
                                <Button variant="outline" size="sm" disabled={isLoading}>
                                    {!isLoading ? (
                                        <>
                                            <Plus className="size-4 mr-1.5" />
                                            Create Vault
                                        </>
                                    ) : (
                                        <>
                                            <LoaderCircle className="size-4 animate-spin" />
                                            Create Vault
                                        </>
                                    )}
                                </Button>
                            </CreateVaultDialog>
                        </CardContent>
                    </Card>
                )}

                {!isLoading && !error && vaults && vaults.length > 0 && (
                    <div className={cn(
                        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 relative transition-opacity duration-200",
                    )}>
                        {vaults?.map((vault) => (
                            <VaultCard
                                key={vault.id}
                                vault={vault}
                                isOwner={vault.createdById === user?.id}
                            />
                        ))}
                    </div>
                )}
            </div>

            <LoadingIndicator show={isRevalidating} />
        </>
    );
}
