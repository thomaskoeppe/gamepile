"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Trophy } from "lucide-react";
import Link from "next/link";

import { SafeImage } from "@/components/shared/safe-image";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AchievementGameProgress } from "@/server/queries/achievements";

dayjs.extend(relativeTime);

/**
 * Vertical list of per-game achievement completion rows. Each row links to
 * the game's achievement detail page and shows artwork, unlocked/total
 * counts, the last unlock date, and a completion bar.
 */
export function GameCompletionList({ games }: { games: AchievementGameProgress[] }) {
    return (
        <div className="space-y-2">
            {games.map((game) => {
                const perfect = game.total > 0 && game.unlocked >= game.total;

                return (
                    <Link
                        key={game.id}
                        href={`/achievements/${game.id}`}
                        className="block rounded-xl border bg-card p-3 transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                    >
                        <div className="flex items-center gap-4">
                            <div className="relative h-11 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                                <SafeImage
                                    srcs={[game.capsuleImageUrl, game.headerImageUrl]}
                                    alt={game.name}
                                    width={184}
                                    height={69}
                                    className="h-full w-full object-cover"
                                    fallbackLabel={game.name}
                                    fallbackClassName="rounded-md"
                                />
                            </div>

                            <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                                        <span className="truncate">{game.name}</span>
                                        {perfect && (
                                            <Badge className="shrink-0 border-primary/40 bg-primary/15 text-[10px] text-primary">
                                                <Trophy className="mr-1 size-3" />
                                                100%
                                            </Badge>
                                        )}
                                    </p>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {game.unlocked} / {game.total}
                                        <span className="ml-2 font-medium text-foreground">{game.percent}%</span>
                                    </span>
                                </div>

                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all",
                                            perfect ? "bg-primary" : "bg-primary/70",
                                        )}
                                        style={{ width: `${game.percent}%` }}
                                    />
                                </div>

                                <p className="text-[11px] text-muted-foreground">
                                    {game.lastUnlockAt
                                        ? `Last unlock ${dayjs(game.lastUnlockAt).fromNow()}`
                                        : "No achievements unlocked yet"}
                                </p>
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
