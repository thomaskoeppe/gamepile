'use client';

import {
    ArrowRight,
    Crown,
    Gamepad2,
    Globe,
    Library,
    LoaderCircle,
    Lock,
    Plus,
    RefreshCcw,
    TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import {CreateCollectionDialog} from "@/components/dialogs/create-collection";
import { Header } from "@/components/header";
import { LoadingIndicator } from "@/components/shared/loading-indicator";
import { Shimmer } from "@/components/shared/shimmer";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription,CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {useServerQuery} from "@/lib/hooks/use-server-query";
import {useAppSettings} from "@/lib/providers/app-settings";
import {useSession} from "@/lib/providers/session";
import {cn} from "@/lib/utils";
import type {Prisma} from "@/prisma/generated/browser";
import {getCollections} from "@/server/queries/collections";

type CollectionUserPreview = { id: string; username: string; avatarUrl: string | null };

type CollectionCardData = Prisma.CollectionGetPayload<{
    include: {
        _count: { select: { games: true } };
        createdBy: { select: { id: true; username: true; avatarUrl: true } };
        users: { include: { user: { select: { id: true; username: true; avatarUrl: true } } } };
        games: {
            take: 5;
            orderBy: { addedAt: "asc" };
            include: { game: { select: { appId: true } } };
        };
    };
}>;

function UserAvatarStack({
    creator,
    users,
}: {
    creator: CollectionUserPreview;
    users: Prisma.CollectionUserGetPayload<{
        include: { user: { select: { id: true; username: true; avatarUrl: true } } };
    }>[];
}) {
    const allUsers = [
        { user: creator, isOwner: true },
        ...users
            .filter((u) => u.user.id !== creator.id)
            .map((u) => ({ user: u.user, isOwner: false })),
    ];

    const visible = allUsers.slice(0, 4);
    const overflow = allUsers.length - visible.length;

    return (
        <TooltipProvider delayDuration={200}>
            <div className="flex items-center -space-x-2">
                {visible.map(({ user, isOwner }) => (
                    <Tooltip key={user.id}>
                        <TooltipTrigger asChild>
                            <div className="relative">
                                <Avatar className="size-7 border-2 border-card ring-1 ring-border hover:scale-110 transition-transform cursor-pointer">
                                    <AvatarImage src={user.avatarUrl ?? undefined} alt={user.username} />
                                    <AvatarFallback className="text-[10px] bg-muted">
                                        {user.username.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                {isOwner && (
                                    <Crown className="absolute -top-1.5 -right-1 size-3 text-yellow-400 fill-yellow-400 drop-shadow" />
                                )}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            <span className="flex items-center gap-1">
                                {user.username}
                                {isOwner && (
                                    <Crown className="size-3 text-yellow-400 fill-yellow-400" />
                                )}
                            </span>
                        </TooltipContent>
                    </Tooltip>
                ))}

                {overflow > 0 && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Avatar className="size-7 border-2 border-card ring-1 ring-border cursor-pointer hover:ring-primary/40 transition-all">
                                <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                                    +{overflow}
                                </AvatarFallback>
                            </Avatar>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {allUsers
                                .slice(4)
                                .map((u) => u.user.username)
                                .join(", ")}
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </TooltipProvider>
    );
}

function CollectionCard({ collection }: { collection: CollectionCardData }) {
    return (
        <Link href={`/collections/${collection.id}`} className="group">
            <Card className="h-full bg-card border-border transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5">
                <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1.5 min-w-0">
                            <CardTitle className="text-base truncate">
                                {collection.name}
                            </CardTitle>
                            {collection.description ? (
                                <CardDescription className="line-clamp-1">
                                    {collection.description}
                                </CardDescription>
                            ) : (
                                <CardDescription>No description</CardDescription>
                            )}
                        </div>
                        <Badge
                            variant="outline"
                            className="shrink-0 text-xs capitalize gap-1"
                        >
                            {collection.type === "PRIVATE" ? (
                                <Lock className="size-3" />
                            ) : (
                                <Globe className="size-3" />
                            )}
                            {collection.type === "PRIVATE" ? "Private" : "Public"}
                        </Badge>
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="flex items-center justify-between">
                        <UserAvatarStack
                            creator={collection.createdBy}
                            users={collection.users}
                        />
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Gamepad2 className="size-4" />
                            <span>
                                {collection._count.games}{" "}
                                {collection._count.games === 1 ? "game" : "games"}
                            </span>
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="justify-between text-xs text-muted-foreground">
                    <span>
                        {new Date(collection.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                        })}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground group-hover:text-primary/80 transition-colors">
                        View
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                </CardFooter>
            </Card>
        </Link>
    );
}

export default function CollectionsPage() {
    const { user, isLoading: sessionLoading } = useSession();
    const { getSetting } = useAppSettings();

    const {
        data: result,
        isLoading: collectionsLoading,
        isValidating,
        isRevalidating,
        mutate,
    } = useServerQuery(
        user ? ["collections", user.id] : null,
        getCollections
    );

    const isLoading = sessionLoading || collectionsLoading || result === undefined;
    const collections = result?.success ? result.data : null;
    const ownedCollectionCount = collections?.filter((collection) => collection.createdBy.id === user?.id).length ?? 0;
    const error = result?.success === false ? result : null;

    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight">Collections</h1>
                        <p className="text-sm text-muted-foreground">
                            Browse and manage your game collections
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <CreateCollectionDialog onReload={() => mutate()}>
                            <Button variant="outline" disabled={isLoading || getSetting("MAX_COLLECTIONS_PER_USER") <= ownedCollectionCount}>
                                {!isLoading ? (
                                    <>
                                        <Plus className="size-4 mr-1.5" />
                                        Create Collection
                                    </>
                                ) : (
                                    <>
                                        <LoaderCircle className="size-4 animate-spin" />
                                        Create Collection
                                    </>
                                )}
                            </Button>
                        </CreateCollectionDialog>

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
                            <Shimmer key={i} className="h-50" />
                        ))}
                    </div>
                )}

                {error && (
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <TriangleAlert className="size-10 text-destructive mb-4" />
                            <p className="text-sm font-medium mb-1">Failed to load collections</p>
                            <p className="text-sm text-muted-foreground mb-6">{error.error}</p>

                            <Button variant="outline" size="sm" onClick={() => mutate()}>
                                <RefreshCcw className="size-4 mr-1.5" />
                                Retry
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {!isLoading && !error && (!collections || collections.length === 0) && (
                    <Card className="bg-card border-border">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <Library className="size-10 text-muted-foreground mb-4" />
                            <p className="text-sm font-medium mb-1">No collections yet</p>
                            <p className="text-sm text-muted-foreground mb-6">
                                Create your first collection to organize your games
                            </p>

                            <CreateCollectionDialog onReload={() => mutate()}>
                                <Button variant="outline" size="sm" disabled={isLoading}>
                                    {!isLoading ? (
                                        <>
                                            <Plus className="size-4 mr-1.5" />
                                            Create Collection
                                        </>
                                    ) : (
                                        <>
                                            <LoaderCircle className="size-4 animate-spin" />
                                            Create Collection
                                        </>
                                    )}
                                </Button>
                            </CreateCollectionDialog>
                        </CardContent>
                    </Card>
                )}

                {!isLoading && !error && collections && collections.length > 0 && (
                    <div className={cn(
                        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 relative transition-opacity duration-200",
                    )}>
                        {collections.map((collection) => (
                            <CollectionCard key={collection.id} collection={collection} />
                        ))}
                    </div>
                )}
            </div>

            <LoadingIndicator show={isRevalidating} />
        </>
    );
}