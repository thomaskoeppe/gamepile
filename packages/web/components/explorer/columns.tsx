"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Apple, ArrowDown, ArrowUp, ArrowUpDown, Cpu,Monitor } from "lucide-react";
import {ElementType, useState} from "react";

import { AddToCollectionDropdown } from "@/components/game/add-to-collection-dropdown";
import { SafeImage } from "@/components/safe-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ExplorerGameRow } from "@/types/explorer";

const PLATFORM_ICONS: Record<string, { icon: ElementType; label: string }> = {
    WINDOWS: { icon: Monitor, label: "Windows" },
    MAC: { icon: Apple, label: "macOS" },
    LINUX: { icon: Cpu, label: "Linux" },
};

function MetacriticBadge({ score }: { score: number | null }) {
    if (score == null)
        return <span className="text-xs text-muted-foreground">—</span>;

    const colorClass =
        score >= 75
            ? "bg-green-500/10 text-green-500 border-green-500/30"
            : score >= 50
                ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
                : "bg-red-500/10 text-red-500 border-red-500/30";

    return (
        <Badge
            variant="outline"
            className={cn(
                "text-[11px] px-2 py-0.5 font-semibold tabular-nums",
                colorClass,
            )}
        >
            {score}
        </Badge>
    );
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

/** Pills with expandable "+N" that reveals all items on click */
function ExpandablePillList({
    items,
    max = 2,
}: {
    items: { id: string; name: string }[];
    max?: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? items : items.slice(0, max);
    const overflow = items.length - max;

    return (
        <div className="flex flex-wrap gap-1">
            {visible.map((item) => (
                <Badge
                    key={item.id}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground"
                >
                    {item.name}
                </Badge>
            ))}
            {!expanded && overflow > 0 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(true);
                    }}
                    className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    +{overflow}
                </button>
            )}
            {expanded && items.length > max && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(false);
                    }}
                    className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    less
                </button>
            )}
        </div>
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
            id: "genres",
            header: "Genres",
            size: 210,
            cell: ({ row }) => <ExpandablePillList items={row.original.genres} max={2} />,
        },
        {
            id: "categories",
            header: "Categories",
            size: 210,
            cell: ({ row }) => (
                <ExpandablePillList items={row.original.categories} max={2} />
            ),
        },
        {
            id: "platforms",
            header: "Platforms",
            size: 110,
            cell: ({ row }) => (
                <TooltipProvider delayDuration={300}>
                    <div className="flex items-center gap-2">
                        {row.original.platforms.map((p) => {
                            const entry = PLATFORM_ICONS[p];
                            if (!entry) return null;
                            const Icon = entry.icon;
                            return (
                                <Tooltip key={p}>
                                    <TooltipTrigger asChild>
                                        <Icon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-default" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                        {entry.label}
                                    </TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </div>
                </TooltipProvider>
            ),
        },
        {
            accessorKey: "metacriticScore",
            sortUndefined: "last",
            header: () => (
                <SortableHeader
                    label="MC"
                    field="metacriticScore"
                    currentSort={currentSort}
                    onSort={onSort}
                />
            ),
            size: 80,
            cell: ({ row }) => <MetacriticBadge score={row.original.metacriticScore} />,
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
