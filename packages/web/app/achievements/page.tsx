'use client';

import { CircleGauge, ListChecks, Medal, Search, Trophy, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { GameCompletionList } from "@/components/achievements/game-completion-list";
import { Header } from "@/components/header";
import { LoadingIndicator } from "@/components/shared/loading-indicator";
import { Shimmer } from "@/components/shared/shimmer";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import { getAchievementOverview } from "@/server/queries/achievements";

type SortOption = "completion_desc" | "completion_asc" | "name_asc" | "total_desc" | "recent";
type FilterOption = "all" | "in_progress" | "perfect" | "not_started";

export default function AchievementsPage() {
    const { user, isLoading: sessionLoading } = useSession();
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<SortOption>("completion_desc");
    const [filter, setFilter] = useState<FilterOption>("all");

    const { data: overviewResult, isLoading: overviewLoading, isRevalidating, mutate } = useServerQuery(
        user ? ["achievement-overview", user.id] : null, () => getAchievementOverview(),
    );

    const isLoading = sessionLoading || overviewLoading || overviewResult === undefined;
    const overview = overviewResult?.success ? overviewResult.data : null;
    const loadFailed = overviewResult !== undefined && !overviewResult?.success;

    const visibleGames = useMemo(() => {
        if (!overview) return [];

        const query = search.trim().toLowerCase();
        const filtered = overview.games.filter((g) => {
            if (query && !g.name.toLowerCase().includes(query)) return false;
            if (filter === "in_progress") return g.unlocked > 0 && g.unlocked < g.total;
            if (filter === "perfect") return g.total > 0 && g.unlocked >= g.total;
            if (filter === "not_started") return g.unlocked === 0;
            return true;
        });

        return [...filtered].sort((a, b) => {
            switch (sort) {
                case "completion_asc":
                    return a.percent - b.percent || a.name.localeCompare(b.name);
                case "name_asc":
                    return a.name.localeCompare(b.name);
                case "total_desc":
                    return b.total - a.total || a.name.localeCompare(b.name);
                case "recent":
                    return (b.lastUnlockAt ?? "").localeCompare(a.lastUnlockAt ?? "")
                        || a.name.localeCompare(b.name);
                case "completion_desc":
                default:
                    return b.percent - a.percent || a.name.localeCompare(b.name);
            }
        });
    }, [overview, search, sort, filter]);

    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight">Achievements</h1>
                        <p className="text-sm text-muted-foreground">
                            Completion progress and missing achievements across your library
                        </p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Shimmer key={i} className="h-16 rounded-xl" />
                            ))}
                        </div>
                        <div className="space-y-2">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <Shimmer key={i} className="h-20 rounded-xl" />
                            ))}
                        </div>
                    </div>
                ) : loadFailed ? (
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                            <TriangleAlert className="h-10 w-10 text-destructive" />
                            <p className="text-sm text-muted-foreground">Failed to load achievement data.</p>
                            <Button variant="outline" size="sm" onClick={() => void mutate()}>
                                Try Again
                            </Button>
                        </CardContent>
                    </Card>
                ) : !overview || overview.games.length === 0 ? (
                    <Card className="bg-card border-border">
                        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                            <Trophy className="h-10 w-10 text-muted-foreground" />
                            <p className="text-sm font-medium">No achievement data yet</p>
                            <p className="max-w-md text-sm text-muted-foreground">
                                Achievements are imported automatically after your library syncs.
                                Check back once a sync has completed.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
                            <StatCard
                                icon={<Trophy className="size-4" />}
                                label="Unlocked"
                                value={`${overview.stats.totalUnlocked.toLocaleString()} / ${overview.stats.totalAchievements.toLocaleString()}`}
                            />
                            <StatCard
                                icon={<CircleGauge className="size-4" />}
                                label="Average completion"
                                value={`${overview.stats.averageCompletion}%`}
                            />
                            <StatCard
                                icon={<Medal className="size-4" />}
                                label="Perfect games"
                                value={overview.stats.perfectGames.toLocaleString()}
                            />
                            <StatCard
                                icon={<ListChecks className="size-4" />}
                                label="In progress"
                                value={overview.stats.gamesInProgress.toLocaleString()}
                            />
                        </div>

                        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
                            <div className="relative flex-1 group">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                    placeholder="Search games..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-8 bg-card/50 border-border focus-visible:border-primary"
                                />
                            </div>

                            <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                                <SelectTrigger className="w-full md:w-56">
                                    <SelectValue placeholder="Sort by..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="completion_desc">Completion (High to Low)</SelectItem>
                                    <SelectItem value="completion_asc">Completion (Low to High)</SelectItem>
                                    <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                                    <SelectItem value="total_desc">Most achievements</SelectItem>
                                    <SelectItem value="recent">Recently unlocked</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
                                <SelectTrigger className="w-full md:w-44">
                                    <SelectValue placeholder="Filter..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All games</SelectItem>
                                    <SelectItem value="in_progress">In progress</SelectItem>
                                    <SelectItem value="perfect">Perfect</SelectItem>
                                    <SelectItem value="not_started">Not started</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {visibleGames.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                No games match the current search or filter.
                            </p>
                        ) : (
                            <GameCompletionList games={visibleGames} />
                        )}
                    </>
                )}
            </div>

            <LoadingIndicator show={isRevalidating} />
        </>
    );
}
