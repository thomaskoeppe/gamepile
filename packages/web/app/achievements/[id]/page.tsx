'use client';

import { ArrowLeft, Trophy, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { AchievementBrowser } from "@/components/achievements/achievement-browser";
import { Header } from "@/components/header";
import { LoadingIndicator } from "@/components/shared/loading-indicator";
import { SafeImage } from "@/components/shared/safe-image";
import { Shimmer } from "@/components/shared/shimmer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import { getGameAchievementsForUser } from "@/server/queries/achievements";

export default function GameAchievementsPage() {
    const { id } = useParams<{ id: string }>();
    const { user, isLoading: sessionLoading } = useSession();

    const { data: result, isLoading: queryLoading, isRevalidating, mutate } = useServerQuery(
        user && id ? ["game-achievements-page", id, user.id] : null,
        () => getGameAchievementsForUser({ gameId: id }),
    );

    const isLoading = sessionLoading || queryLoading || result === undefined;
    const data = result?.success ? result.data : null;
    const loadFailed = result !== undefined && !result?.success;
    const notFound = data !== null && (data.game === null || data.total === 0);

    const percent = data && data.total > 0
        ? Math.round((data.unlockedCount / data.total) * 100)
        : 0;

    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6 max-w-4xl">
                <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
                    <Link href="/achievements">
                        <ArrowLeft className="size-4" />
                        All achievements
                    </Link>
                </Button>

                {isLoading ? (
                    <div className="space-y-4">
                        <Shimmer className="h-24 rounded-xl" />
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Shimmer key={i} className="h-16 rounded-lg" />
                        ))}
                    </div>
                ) : loadFailed ? (
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                            <TriangleAlert className="h-10 w-10 text-destructive" />
                            <p className="text-sm text-muted-foreground">Failed to load achievements.</p>
                            <Button variant="outline" size="sm" onClick={() => void mutate()}>
                                Try Again
                            </Button>
                        </CardContent>
                    </Card>
                ) : notFound || !data?.game ? (
                    <Card className="bg-card border-border">
                        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                            <Trophy className="h-10 w-10 text-muted-foreground" />
                            <p className="text-sm font-medium">No achievements found</p>
                            <p className="max-w-md text-sm text-muted-foreground">
                                This game doesn&apos;t exist or has no achievement data yet.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        <div className="rounded-xl border bg-card p-4">
                            <div className="flex items-center gap-4">
                                <div className="relative h-14 w-32 shrink-0 overflow-hidden rounded-md bg-muted">
                                    <SafeImage
                                        srcs={[data.game.capsuleImageUrl, data.game.headerImageUrl]}
                                        alt={data.game.name}
                                        width={184}
                                        height={69}
                                        className="h-full w-full object-cover"
                                        fallbackLabel={data.game.name}
                                        fallbackClassName="rounded-md"
                                    />
                                </div>

                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <h1 className="truncate text-lg font-semibold tracking-tight">
                                            {data.game.name}
                                        </h1>
                                        <span className="shrink-0 text-sm text-muted-foreground">
                                            {data.unlockedCount} / {data.total}
                                            <span className="ml-2 font-semibold text-foreground">{percent}%</span>
                                        </span>
                                    </div>

                                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-primary transition-all duration-500"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <AchievementBrowser achievements={data.achievements} />
                    </div>
                )}
            </div>

            <LoadingIndicator show={isRevalidating} />
        </>
    );
}
