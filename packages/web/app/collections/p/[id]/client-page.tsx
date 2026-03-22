"use client";

import dayjs from "dayjs";
import { Globe } from "lucide-react";
import Link from "next/link";

import { GameList } from "@/components/game/game-list";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Prisma } from "@/prisma/generated/browser";

export function ClientPage({ collection, games, categories, genres}: {
    collection: Prisma.CollectionGetPayload<{ include: { createdBy: true; _count: { select: { games: true } }; users: { select: { id: true } } } }>;
    games: Array<Prisma.GameGetPayload<{ include: { categories: true, genres: true } }> & { playtime?: number; owned: boolean }>,
    categories: { name: string }[],
    genres: { name: string }[],
}) {
    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6">
                <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
                    <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground">
                        You are viewing a public collection in read-only mode.{" "}
                        <Link
                            href="/"
                            className="text-primary underline underline-offset-4 hover:text-primary/80"
                        >
                            Sign in
                        </Link>{" "}
                        for full access.
                    </p>
                </div>

                <div className="space-y-8">
                    <Card className="bg-card border-border shadow-md">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <CardTitle>{collection.name}</CardTitle>
                                <Badge variant="secondary" className="gap-1 text-emerald-400">
                                    <Globe className="h-3 w-3" />
                                    Public
                                </Badge>
                            </div>
                            {collection.description && (
                                <CardDescription>{collection.description}</CardDescription>
                            )}
                        </CardHeader>

                        <CardContent>
                            <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <dt className="text-foreground">Created By</dt>
                                    <dd className="text-muted-foreground">
                                        {collection.createdBy.username}
                                    </dd>
                                </div>

                                <div className="flex items-center gap-2">
                                    <dt className="text-foreground">Games</dt>
                                    <dd className="text-muted-foreground">
                                        {collection._count.games}
                                    </dd>
                                </div>

                                <div className="flex items-center gap-2">
                                    <dt className="text-foreground">Created At</dt>
                                    <dd className="text-muted-foreground">
                                        {dayjs(collection.createdAt).format("Do MMM YYYY")}
                                    </dd>
                                </div>
                            </dl>
                        </CardContent>
                    </Card>

                    {games.length > 0 ? (
                        <div className="flex justify-center">
                            <GameList
                                games={games}
                                categories={categories.map((c) => c.name)}
                                genres={genres.map((g) => g.name)}
                                showOwnedFilter={false}
                            />
                        </div>
                    ) : (
                        <Card className="bg-card border-border shadow-md">
                            <CardContent className="py-12 text-center">
                                <p className="text-muted-foreground">
                                    This collection does not have any games yet.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </>
    );
}