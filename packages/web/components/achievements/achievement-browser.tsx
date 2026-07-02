"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Lock, Search } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { GameAchievementEntry } from "@/server/queries/achievements";

dayjs.extend(relativeTime);

function AchievementRow({ achievement }: { achievement: GameAchievementEntry }) {
    const unlocked = achievement.achievedAt !== null;
    const masked = achievement.hidden && !unlocked;

    return (
        <div
            className={cn(
                "flex items-center gap-3 rounded-lg border p-3",
                unlocked ? "bg-card" : "bg-muted/30 opacity-80",
            )}
        >
            <div className="relative size-12 shrink-0 overflow-hidden rounded bg-muted">
                {(unlocked ? achievement.icon : achievement.icongray) ? (
                    <Image
                        src={unlocked ? achievement.icon : achievement.icongray}
                        alt={masked ? "Hidden achievement" : achievement.displayName}
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
                    {masked ? "Hidden achievement" : achievement.displayName}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                    {masked
                        ? "Unlock this achievement to reveal its details."
                        : achievement.description || " "}
                </p>
            </div>

            {unlocked && achievement.achievedAt && (
                <span
                    className="shrink-0 text-[11px] text-muted-foreground"
                    title={new Date(achievement.achievedAt).toLocaleString()}
                >
                    {dayjs(achievement.achievedAt).fromNow()}
                </span>
            )}
        </div>
    );
}

function RowList({ achievements, emptyText }: { achievements: GameAchievementEntry[]; emptyText: string }) {
    if (achievements.length === 0) {
        return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
    }

    return (
        <div className="space-y-1.5">
            {achievements.map((a) => (
                <AchievementRow key={a.id} achievement={a} />
            ))}
        </div>
    );
}

/**
 * Page-scale achievement browser: Missing / Unlocked / All tabs with text
 * search. Missing achievements sort alphabetically (hidden ones last, since
 * their names are masked); unlocked ones sort by unlock date, newest first.
 */
export function AchievementBrowser({ achievements }: { achievements: GameAchievementEntry[] }) {
    const [search, setSearch] = useState("");

    const { missing, unlocked, all } = useMemo(() => {
        const query = search.trim().toLowerCase();

        // Masked hidden achievements expose no text, so they only appear
        // when no search query is active.
        const matches = (a: GameAchievementEntry) => {
            if (!query) return true;
            if (a.hidden && a.achievedAt === null) return false;
            return a.displayName.toLowerCase().includes(query)
                || a.description.toLowerCase().includes(query);
        };

        const visible = achievements.filter(matches);

        const missingList = visible
            .filter((a) => a.achievedAt === null)
            .sort((a, b) => {
                if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
                return a.displayName.localeCompare(b.displayName);
            });

        const unlockedList = visible
            .filter((a) => a.achievedAt !== null)
            .sort((a, b) => (b.achievedAt ?? "").localeCompare(a.achievedAt ?? ""));

        return {
            missing: missingList,
            unlocked: unlockedList,
            all: [...unlockedList, ...missingList],
        };
    }, [achievements, search]);

    const hasMissing = achievements.some((a) => a.achievedAt === null);

    return (
        <Tabs defaultValue={hasMissing ? "missing" : "unlocked"} className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <TabsList className="w-auto self-start">
                    <TabsTrigger value="missing">Missing ({missing.length})</TabsTrigger>
                    <TabsTrigger value="unlocked">Unlocked ({unlocked.length})</TabsTrigger>
                    <TabsTrigger value="all">All ({all.length})</TabsTrigger>
                </TabsList>

                <div className="relative group md:w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                        placeholder="Search achievements..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 bg-card/50 border-border focus-visible:border-primary"
                    />
                </div>
            </div>

            <TabsContent value="missing" className="focus-visible:outline-none">
                <RowList
                    achievements={missing}
                    emptyText={search ? "No missing achievements match your search." : "Nothing missing — this game is 100% complete!"}
                />
            </TabsContent>
            <TabsContent value="unlocked" className="focus-visible:outline-none">
                <RowList
                    achievements={unlocked}
                    emptyText={search ? "No unlocked achievements match your search." : "No achievements unlocked yet."}
                />
            </TabsContent>
            <TabsContent value="all" className="focus-visible:outline-none">
                <RowList achievements={all} emptyText="No achievements match your search." />
            </TabsContent>
        </Tabs>
    );
}
