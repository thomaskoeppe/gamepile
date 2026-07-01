"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Lock } from "lucide-react";
import Image from "next/image";

import { Shimmer } from "@/components/shared/shimmer";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { cn } from "@/lib/utils";
import { getGameAchievementsForUser } from "@/server/queries/achievements";

dayjs.extend(relativeTime);

/**
 * Achievement list for a game, annotated with the current user's unlock
 * state: an unlock-progress bar followed by one row per achievement.
 * Hidden achievements that are still locked mask their name and description.
 */
export function AchievementList({ gameId }: { gameId: string }) {
    const { data, isInitialLoading } = useServerQuery(
        ["game-achievements", gameId], () => getGameAchievementsForUser({ gameId }),
    );

    if (isInitialLoading) {
        return (
            <div className="space-y-3">
                <Shimmer className="h-2 w-full rounded" />
                {Array.from({ length: 5 }).map((_, i) => (
                    <Shimmer key={i} className="h-12 w-full rounded" />
                ))}
            </div>
        );
    }

    if (!data?.success || data.data.total === 0) {
        return (
            <p className="text-sm text-muted-foreground py-8 text-center">
                No achievements found for this game.
            </p>
        );
    }

    const { total, unlockedCount, achievements } = data.data;
    const percent = Math.round((unlockedCount / total) * 100);

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                        {unlockedCount} / {total} unlocked
                    </span>
                    <span className="font-medium">{percent}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${percent}%` }}
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                {achievements.map((a) => {
                    const unlocked = a.achievedAt !== null;
                    const masked = a.hidden && !unlocked;

                    return (
                        <div
                            key={a.id}
                            className={cn(
                                "flex items-center gap-3 rounded-lg border p-2",
                                unlocked ? "bg-card" : "bg-muted/30 opacity-80",
                            )}
                        >
                            <div className="relative size-10 shrink-0 rounded bg-muted overflow-hidden">
                                {(unlocked ? a.icon : a.icongray) ? (
                                    <Image
                                        src={unlocked ? a.icon : a.icongray}
                                        alt={masked ? "Hidden achievement" : a.displayName}
                                        fill
                                        className={cn("object-cover", !unlocked && "grayscale")}
                                    />
                                ) : (
                                    <div className="flex size-full items-center justify-center">
                                        <Lock className="size-4 text-muted-foreground" />
                                    </div>
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">
                                    {masked ? "Hidden achievement" : a.displayName}
                                </p>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                    {masked
                                        ? "Unlock this achievement to reveal its details."
                                        : a.description || " "}
                                </p>
                            </div>

                            {unlocked && a.achievedAt && (
                                <span
                                    className="text-[10px] text-muted-foreground shrink-0"
                                    title={new Date(a.achievedAt).toLocaleString()}
                                >
                                    {dayjs(a.achievedAt).fromNow()}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
