import { useVirtualizer } from '@tanstack/react-virtual';
import React, {Fragment, useEffect, useState} from "react";
import { useRef } from "react";

import {GameTile} from "@/components/game/game-tile";
import {MultiSelectCombobox} from "@/components/multi-select-combobox";
import {Shimmer} from "@/components/shimmer";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import { browserLog } from "@/lib/browser-logger";
import {AppSettingKey, useAppSettings} from "@/lib/providers/app-settings";
import {Prisma} from "@/prisma/generated/client";

function GameTileSkeleton({ width, height }: { width: number; height: number }) {
    return (
        <div className="flex flex-col gap-2 p-2" style={{ width, height }}>
            <Shimmer className="flex-1 rounded-md" />
        </div>
    );
}

export function GameList({
     games,
     categories,
     genres,
     showOwnedFilter,
     isLoading = false,
     onRevalidate,
 }: {
    games: Array<Prisma.GameGetPayload<{ include: { categories: true, genres: true } }> & { playtime?: number; owned: boolean }>;
    categories: string[];
    genres: string[];
    showOwnedFilter?: boolean;
    isLoading?: boolean;
    onRevalidate?: () => void;
}) {
    const { getSetting } = useAppSettings();

    const [visibleGames, setVisibleGames] = useState(games);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [sortOption, setSortOption] = useState<string>("playtime_desc");
    const [showOnlyOwnedState, setShowOnlyOwnedState] = useState<"owned" | "unowned" | "all">("all");
    const ref = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState<number | null>(null);

    const handleTagsChange = (tags: string[]) => {
        browserLog.info('Game list filter changed', { count: tags.length, tags });
        setSelectedTags(tags);
    };

    const handleSortChange = (value: string) => {
        browserLog.info('Game list sort changed', { sortBy: value });
        setSortOption(value);
    };

    const handleOwnershipChange = (value: string) => {
        browserLog.info('Game list ownership filter changed', { ownership: value });
        setShowOnlyOwnedState(value as "owned" | "unowned" | "all");
    };

    useEffect(() => {
        if (!ref.current) return;

        const observer = new ResizeObserver(([entry]) => {
            setContainerWidth(entry.contentRect.width);
        });

        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    const tileSize = (() => {
        if (containerWidth === null) return null;
        if (containerWidth >= 1400) return 200;
        if (containerWidth >= 1200) return 180;
        if (containerWidth >= 992) return 160;
        if (containerWidth >= 768) return 140;
        return 120;
    })();

    const columnCount = tileSize && containerWidth ? Math.floor(containerWidth / tileSize) : null;
    const leftoverSpace = tileSize && columnCount && containerWidth ? containerWidth - columnCount * tileSize : 0;
    const adjustedTileSize = tileSize && columnCount ? tileSize + leftoverSpace / columnCount : null;

    // eslint-disable-next-line react-hooks/incompatible-library
    const rowVirtualizer = useVirtualizer({
        count: adjustedTileSize && columnCount ? Math.ceil(visibleGames.length / columnCount) : 0,
        getScrollElement: () => ref.current,
        estimateSize: () => (adjustedTileSize ?? 200) * 1.5,
        overscan: getSetting(AppSettingKey.UI_GAME_LIBRARY_PRERENDERED_ROWS),
    });

    const columnVirtualizer = useVirtualizer({
        horizontal: true,
        count: columnCount ?? 0,
        getScrollElement: () => ref.current,
        estimateSize: () => adjustedTileSize ?? 200,
        overscan: 0,
    });

    useEffect(() => {
        const filteredGames = games.filter(ug => {
            const gameCategories = ug.categories.map(c => `category_${c.name}`);
            const gameGenres = ug.genres.map(g => `genre_${g.name}`);
            const gameTags = [...gameCategories, ...gameGenres];

            if (showOnlyOwnedState === "owned" && !ug.owned) return false;
            if (showOnlyOwnedState === "unowned" && ug.owned) return false;

            return selectedTags.every(tag => gameTags.includes(tag));
        });

        const filteredGames2 = filteredGames.sort((a, b) => {
            switch (sortOption) {
                case "name_asc":
                    return a.name.localeCompare(b.name);
                case "name_desc":
                    return b.name.localeCompare(a.name);
                case "playtime_asc":
                    return (a.owned ? (a.playtime ?? -1) : -1) - (b.owned ? (b.playtime ?? -1) : -1);
                case "playtime_desc":
                    return (b.owned ? (b.playtime ?? -1) : -1) - (a.owned ? (a.playtime ?? -1) : -1);
                default:
                    return 0;
            }
        });

        setVisibleGames(filteredGames2);
        columnVirtualizer.measure();
        rowVirtualizer.measure();
    }, [selectedTags, games, sortOption, columnVirtualizer, rowVirtualizer, showOnlyOwnedState]);

    return (
        <div ref={ref} style={{ height: '100%', width: '100%', overflow: 'auto' }}>
            <div className="flex justify-end items-center flex-wrap gap-4">
                {isLoading || !adjustedTileSize ? (
                    <>
                        <Shimmer className="h-10 w-full max-w-3xl flex-1 my-4 rounded-md" />
                        <Shimmer className="h-10 w-64 my-4 rounded-md" />
                        {showOwnedFilter && <Shimmer className="h-10 w-48 my-4 rounded-md" />}
                    </>
                ) : (
                    <>
                        <MultiSelectCombobox
                            options={[
                                ...categories.map(category => ({ label: category, value: `category_${category}`, category: "category" })),
                                ...genres.map(genre => ({ label: genre, value: `genre_${genre}`, category: "genre" })),
                            ]}
                            placeholder="Filter games..."
                            className="w-full max-w-3xl my-4"
                            onChange={handleTagsChange}
                            selected={selectedTags}
                        />

                        <Select onValueChange={handleSortChange} value={sortOption}>
                            <SelectTrigger className="w-64 my-4">
                                <SelectValue placeholder="Sort by..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                                <SelectItem value="name_desc">Name (Z-A)</SelectItem>
                                <SelectItem value="playtime_asc">Playtime (Low to High)</SelectItem>
                                <SelectItem value="playtime_desc">Playtime (High to Low)</SelectItem>
                            </SelectContent>
                        </Select>

                        {showOwnedFilter && (
                            <Select onValueChange={handleOwnershipChange} value={showOnlyOwnedState}>
                                <SelectTrigger className="w-48 my-4">
                                    <SelectValue placeholder="Ownership filter..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Games</SelectItem>
                                    <SelectItem value="owned">Owned Games</SelectItem>
                                    <SelectItem value="unowned">Unowned Games</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    </>
                )}
            </div>

            {isLoading || !adjustedTileSize || !columnCount ? (
                adjustedTileSize && columnCount ? (
                    <div
                        className="grid"
                        style={{ gridTemplateColumns: `repeat(${columnCount}, ${adjustedTileSize}px)` }}
                    >
                        {Array.from({ length: columnCount * 3 }).map((_, i) => (
                            <GameTileSkeleton key={i} width={adjustedTileSize} height={adjustedTileSize * 1.5} />
                        ))}
                    </div>
                ) : (
                    <div className="w-full" />
                )
            ) : (
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: `${columnVirtualizer.getTotalSize()}px`,
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                        <Fragment key={virtualRow.key}>
                            {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
                                const game = visibleGames[virtualRow.index * columnCount + virtualColumn.index];

                                return (
                                    <div
                                        key={virtualColumn.key}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: `${virtualColumn.size}px`,
                                            height: `${virtualRow.size}px`,
                                            transform: `translateX(${virtualColumn.start}px) translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        {visibleGames[virtualRow.index * columnCount + virtualColumn.index] && (
                                            <GameTile game={game} key={game.id} onRevalidate={onRevalidate} />
                                        )}
                                    </div>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            )}

            <div className="text-sm text-muted-foreground pt-2">
                {games.length > 0 ? (
                    <>
                        Showing {visibleGames.length} of{" "}
                        {visibleGames.length} games
                    </>
                ) : (
                    "No results"
                )}
            </div>
        </div>
    );
}