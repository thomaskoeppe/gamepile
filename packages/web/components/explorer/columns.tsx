"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { AddToCollectionDropdown } from "@/components/game/add-to-collection-dropdown";
import { ExpandablePills } from "@/components/shared/expandable-pills";
import { PlatformIcons } from "@/components/shared/platform-icons";
import { ReviewScoreCircle } from "@/components/shared/review-score-circle";
import { SafeImage } from "@/components/shared/safe-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExplorerGameRow } from "@/types/explorer";

function ReviewScoreBadge({ score }: { score: number | null }) {
    if (score == null)
        return <span className="text-xs text-muted-foreground">—</span>;

    return <ReviewScoreCircle score={score} size="sm" />;
}

function SortableHeader({
    label,
    field,
    currentSort,
    onSort,
}: {
    label: string;
    field: string;
    currentSort?: { field: string; direction: "asc" | "desc" };
    onSort: (field: string) => void;
}) {
    const isActive = currentSort?.field === field;
    const direction = currentSort?.direction;

    return (
        <Button
            variant="ghost"
            size="sm"
            className={cn("-ml-3 h-8 text-xs font-medium", isActive && "text-primary")}
            onClick={() => onSort(field)}
        >
            {label}
            {isActive ? (
                direction === "asc" ? (
                    <ArrowUp className="ml-1.5 h-3 w-3" />
                ) : (
                    <ArrowDown className="ml-1.5 h-3 w-3" />
                )
            ) : (
                <ArrowUpDown className="ml-1.5 h-3 w-3 opacity-50" />
            )}
        </Button>
    );
}

export function createColumns(
    onSort: (field: string) => void,
    currentSort?: { field: string; direction: "asc" | "desc" },
): ColumnDef<ExplorerGameRow>[] {
    return [
        {
            id: "image",
            header: "",
            size: 80,
            cell: ({ row }) => {
                const appId = row.original.appId;
                if (!appId) return null;
                return (
                    <div className="relative w-16 h-7 overflow-hidden rounded-md bg-muted">
                        <SafeImage
                            srcs={[
                                `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`,
                                `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
                            ]}
                            alt={row.original.name}
                            fill
                            className="object-cover transition-transform hover:scale-105"
                            sizes="64px"
                        />
                    </div>
                );
            },
        },
        {
            accessorKey: "name",
            header: () => (
                <SortableHeader
                    label="Name"
                    field="name"
                    currentSort={currentSort}
                    onSort={onSort}
                />
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0">
                        <span className="block font-medium truncate max-w-60 hover:text-primary transition-colors cursor-default text-sm">
                          {row.original.name !== "" ? row.original.name : <span className="text-muted-foreground font-medium italic">No name</span>}
                        </span>
                        {(row.original.developers?.length > 0 || row.original.publishers?.length > 0) && (
                            <span className="block truncate max-w-60 text-[11px] text-muted-foreground">
                {row.original.developers?.join(", ") ?? row.original.publishers?.join(", ")}
              </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {row.original.isFree && (
                            <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20"
                            >
                                Free
                            </Badge>
                        )}
                        {row.original.owned && (
                            <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-500 bg-green-500/10"
                            >
                                Owned
                            </Badge>
                        )}
                    </div>
                </div>
            ),
        },

        {
            accessorKey: "type",
            header: "Type",
            size: 90,
            cell: ({ row }) => (
                <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 font-normal capitalize"
                >
                    {row.original.type?.toLowerCase() ?? "—"}
                </Badge>
            ),
        },
        {
            id: "tags",
            header: "Tags",
            size: 210,
            cell: ({ row }) => <ExpandablePills items={row.original.tags} max={2} variant="secondary" />,
        },
        {
            id: "categories",
            header: "Categories",
            size: 210,
            cell: ({ row }) => (
                <ExpandablePills items={row.original.categories} max={2} variant="secondary" />
            ),
        },
        {
            id: "platforms",
            header: "Platforms",
            size: 110,
            cell: ({ row }) => (
                <PlatformIcons
                    platforms={row.original.platforms}
                    iconClassName="h-3.5 w-3.5 hover:text-foreground transition-colors"
                />
            ),
        },
        {
            accessorKey: "reviewScore",
            sortUndefined: "last",
            header: () => (
                <SortableHeader
                    label="Score"
                    field="reviewScore"
                    currentSort={currentSort}
                    onSort={onSort}
                />
            ),
            size: 80,
            cell: ({ row }) => <ReviewScoreBadge score={row.original.reviewPercentage} />,
        },
        {
            accessorKey: "releaseDate",
            header: () => (
                <SortableHeader
                    label="Release"
                    field="releaseDate"
                    currentSort={currentSort}
                    onSort={onSort}
                />
            ),
            size: 120,
            cell: ({ row }) => {
                const d = row.original.releaseDate;
                if (!d)
                    return <span className="text-xs text-muted-foreground">TBA</span>;
                return (
                    <span className="text-xs text-muted-foreground tabular-nums">
            {new Date(d).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
            })}
          </span>
                );
            },
        },
        {
            id: "actions",
            header: "",
            size: 48,
            cell: ({ row }) => (
                <AddToCollectionDropdown
                    gameId={row.original.id}
                    side="left"
                    align="start"
                />
            ),
        },
    ];
}
