"use client";

import dayjs from "dayjs";
import { Pencil, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { DeleteCollectionDialog } from "@/components/dialogs/delete-collection";
import { RenameCollectionDialog } from "@/components/dialogs/rename-collection";
import { GameList } from "@/components/game/game-list";
import { Header } from "@/components/header";
import { LoadingIndicator } from "@/components/shared/loading-indicator";
import { MemberList, type MemberUser } from "@/components/shared/member-list";
import { Shimmer } from "@/components/shared/shimmer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import { getGamesForCollection } from "@/server/queries/collection-games";
import { getCollectionMembers } from "@/server/queries/collection-members";
import { getCollection } from "@/server/queries/collections";
import { getGameCategories, getGameGenres } from "@/server/queries/games";

export default function Page() {
    const { id } = useParams<{ id: string }>();
    const { user } = useSession();
    const router = useRouter();

    const {
        data: collectionResult,
        isInitialLoading: collectionInitial,
        isRevalidating: collectionRevalidating,
        mutate: mutateCollection,
    } = useServerQuery(
        user ? ["collection", id, user.id] : null,
        () => getCollection({ collectionId: id })
    );

    const {
        data: gamesResult,
        isInitialLoading: gamesInitial,
        isRevalidating: gamesRevalidating,
        mutate: mutateGames,
    } = useServerQuery(
        user ? ["collection-games", id, user.id] : null,
        () => getGamesForCollection({ collectionId: id })
    );

    const { data: categoriesResult } = useServerQuery(
        ["categories"], () => getGameCategories()
    );

    const { data: genresResult } = useServerQuery(
        ["genres"], () => getGameGenres()
    );

    const {
        data: membersResult,
        mutate: mutateMembers,
    } = useServerQuery(
        user ? ["collection-members", id, user.id] : null,
        () => getCollectionMembers({ collectionId: id })
    );

    const isInitialLoading = collectionInitial || gamesInitial || gamesResult === undefined;
    const isRevalidating = collectionRevalidating || gamesRevalidating;
    const collection = collectionResult?.success ? collectionResult.data : null;
    const games = gamesResult?.success ? gamesResult.data : [];
    const categories = categoriesResult?.success ? categoriesResult.data : [];
    const genres = genresResult?.success ? genresResult.data : [];

    const membersData = membersResult?.success ? membersResult.data : null;
    const isOwner = collection ? collection.createdBy.id === user?.id : false;

    const members: MemberUser[] = [];
    if (membersData) {
        members.push({ ...membersData.owner, isOwner: true });
        for (const m of membersData.members) {
            members.push({
                ...m.user,
                isOwner: false,
                canModify: m.canModify,
                addedBy: m.addedBy,
                addedAt: m.addedAt,
                collectionUserId: m.collectionUserId,
            });
        }
    }

    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6">
                <div className="space-y-4">
                    <div className="flex gap-6">
                        {!isInitialLoading ? (
                            <>
                                <div className="flex-2">
                                    <Card className="h-full bg-card border-border shadow-md">
                                        <CardHeader>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <CardTitle>{collection?.name}</CardTitle>
                                                    <CardDescription>{collection?.description}</CardDescription>
                                                </div>

                                                {isOwner && collection && (
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <RenameCollectionDialog
                                                            collectionId={id}
                                                            currentName={collection.name}
                                                            currentDescription={collection.description ?? undefined}
                                                            onReload={() => mutateCollection()}
                                                        >
                                                            <Button variant="ghost" size="icon" className="size-8">
                                                                <Pencil className="size-4" />
                                                                <span className="sr-only">Rename collection</span>
                                                            </Button>
                                                        </RenameCollectionDialog>

                                                        <DeleteCollectionDialog
                                                            collectionId={id}
                                                            collectionName={collection.name}
                                                            onDeleted={() => router.push("/collections")}
                                                        >
                                                            <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive">
                                                                <Trash2 className="size-4" />
                                                                <span className="sr-only">Delete collection</span>
                                                            </Button>
                                                        </DeleteCollectionDialog>
                                                    </div>
                                                )}
                                            </div>
                                        </CardHeader>

                                        <CardContent className="h-full flex flex-col justify-end">
                                            <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <dt className="text-foreground">ID</dt>
                                                    <dd className="text-muted-foreground">{collection?.id}</dd>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <dt className="text-foreground">Visibility</dt>
                                                    <dd className="text-muted-foreground">{collection?.type}</dd>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <dt className="text-foreground">Created By</dt>
                                                    <dd className="text-muted-foreground">{collection?.createdBy.username}</dd>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <dt className="text-foreground">Created At</dt>
                                                    <dd className="text-muted-foreground">
                                                        {dayjs(collection?.createdAt).format("DD MMM YYYY")}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="flex-1">
                                    <Card className="h-full bg-card border-border shadow-md">
                                        <CardHeader>
                                            <CardTitle>Vault Members</CardTitle>
                                        </CardHeader>

                                        <CardContent>
                                            <MemberList
                                                resourceId={id}
                                                resourceType="collection"
                                                users={members}
                                                isOwner={isOwner}
                                                onMutate={() => { void mutateMembers(); void mutateCollection(); }}
                                            />
                                        </CardContent>
                                    </Card>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex-2">
                                    <Shimmer className="h-34.5" />
                                </div>

                                <div className="flex-1">
                                    <Shimmer className="h-34.5" />
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex justify-center">
                        <GameList
                            games={games}
                            categories={categories}
                            genres={genres}
                            showOwnedFilter
                            isLoading={isInitialLoading}
                            onRevalidate={() => mutateGames()}
                        />
                    </div>
                </div>
            </div>

            <LoadingIndicator show={isRevalidating} />
        </>
    );
}