"use client";

import { Flame } from "lucide-react";

import { GameTile } from "@/components/game/game-tile";
import { Prisma } from "@/prisma/generated/client";

type LibraryGame = Prisma.GameGetPayload<{ include: { categories: true, tags: true } }> & {
    playtime?: number;
    playtime2Weeks?: number;
    owned: boolean;
};

/** Maximum number of tiles shown on the shelf. */
const SHELF_LIMIT = 12;

/**
 * Horizontal shelf of the user's most-played games from the last two weeks,
 * sorted by recent playtime. Renders nothing when nothing was played.
 */
export function RecentlyPlayedShelf({
    games,
    onRevalidate,
}: {
    games: LibraryGame[];
    onRevalidate?: () => void;
}) {
    const recentlyPlayed = games
        .filter((g) => (g.playtime2Weeks ?? 0) > 0)
        .sort((a, b) => (b.playtime2Weeks ?? 0) - (a.playtime2Weeks ?? 0))
        .slice(0, SHELF_LIMIT);

    if (recentlyPlayed.length === 0) return null;

    return (
        <div className="space-y-2 mb-4">
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
                <Flame className="size-4 text-primary" />
                Recently played
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
                {recentlyPlayed.map((game) => (
                    <div key={game.id} className="w-[150px] h-[225px] shrink-0">
                        <GameTile game={game} onRevalidate={onRevalidate} />
                    </div>
                ))}
            </div>
        </div>
    );
}
