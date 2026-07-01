"use client";

import { Clock, Flame, Gamepad2, Trophy } from "lucide-react";
import type { ReactNode } from "react";

import { formatMinutesToHoursMinutes } from "@/lib/utils";

type LibraryStatsGame = {
    name: string;
    playtime?: number;
    playtime2Weeks?: number;
};

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold truncate">{value}</p>
            </div>
        </div>
    );
}

/**
 * Small library summary computed client-side from the already-loaded game
 * list: total games, lifetime playtime, two-week playtime, and the
 * most-played game. Hidden while the library is empty.
 */
export function LibraryStats({ games }: { games: LibraryStatsGame[] }) {
    if (games.length === 0) return null;

    const totalPlaytime = games.reduce((sum, g) => sum + (g.playtime ?? 0), 0);
    const recentPlaytime = games.reduce((sum, g) => sum + (g.playtime2Weeks ?? 0), 0);
    const mostPlayed = games.reduce(
        (best, g) => ((g.playtime ?? 0) > (best?.playtime ?? 0) ? g : best),
        null as LibraryStatsGame | null,
    );

    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
            <StatCard
                icon={<Gamepad2 className="size-4" />}
                label="Games"
                value={games.length.toLocaleString()}
            />
            <StatCard
                icon={<Clock className="size-4" />}
                label="Total playtime"
                value={totalPlaytime > 0 ? formatMinutesToHoursMinutes(totalPlaytime) : "None"}
            />
            <StatCard
                icon={<Flame className="size-4" />}
                label="Past 2 weeks"
                value={recentPlaytime > 0 ? formatMinutesToHoursMinutes(recentPlaytime) : "None"}
            />
            <StatCard
                icon={<Trophy className="size-4" />}
                label="Most played"
                value={mostPlayed && (mostPlayed.playtime ?? 0) > 0 ? mostPlayed.name : "—"}
            />
        </div>
    );
}
