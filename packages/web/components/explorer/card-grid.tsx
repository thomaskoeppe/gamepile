"use client";

import {
    Building2, CalendarDays, CheckCircle2,
    CodeXml, Cpu, ExternalLink, FolderDown, FolderKanban,
    Gamepad2, Hash, Library,
    Megaphone, Package, Package2,
    Tag, User,
} from "lucide-react";
import Link from "next/link";
import { ElementType } from "react";

import { AddToCollectionDropdown } from "@/components/game/add-to-collection-dropdown";
import { ExpandablePills } from "@/components/shared/expandable-pills";
import { PlatformIcons } from "@/components/shared/platform-icons";
import { ReviewScoreCircle } from "@/components/shared/review-score-circle";
import { SafeImage } from "@/components/shared/safe-image";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GameType } from "@/prisma/generated/enums";
import type { ExplorerGameRow } from "@/types/explorer";

interface CardGridProps {
    data: ExplorerGameRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    isLoading?: boolean;
    isRefreshing?: boolean;
}

const TYPE_CONFIG: Record<GameType, { icon: ElementType; label: string; color: string }> = {
    GAME:        { icon: Gamepad2,     label: "Game",     color: "text-primary"         },
    DLC:         { icon: FolderDown,   label: "DLC",      color: "text-primary/80"      },
    DEMO:        { icon: FolderKanban, label: "Demo",     color: "text-foreground"      },
    MOD:         { icon: Cpu,          label: "Mod",      color: "text-muted-foreground" },
    ADVERTISING: { icon: Megaphone,    label: "Software", color: "text-muted-foreground" },
    UNKNOWN:     { icon: Package,      label: "Unknown",  color: "text-muted-foreground"},
};

function ReviewScoreBadge({ score }: { score: number | null }) {
    if (score == null) return null;

    return (
        <div className="absolute top-2 right-2">
            <ReviewScoreCircle score={score} size="sm" className="shadow-xl" />
        </div>
    );
}

function GameCard({ game }: { game: ExplorerGameRow }) {

    const typeConfig = TYPE_CONFIG[game.type] ?? TYPE_CONFIG.UNKNOWN;
    const TypeIcon = typeConfig.icon;

    const steamUrl = game.appId
        ? `https://store.steampowered.com/app/${game.appId}`
        : null;

    return (
        <div className="group relative flex flex-col rounded-xl border border-border/40 bg-card/40 overflow-hidden hover:border-border/80 hover:bg-card/70 transition-all duration-300 hover:shadow-2xl hover:shadow-black/20 hover:-translate-y-0.5">
            <div className="relative aspect-460/215 bg-muted overflow-hidden shrink-0">
                <div className="absolute inset-0 transform group-hover:scale-105 transition-transform duration-500 ease-out">
                    <SafeImage
                        srcs={[
                            `https://steamcdn-a.akamaihd.net/steam/apps/${game.appId}/header.jpg`,
                            `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appId}/library_hero.jpg`,
                            `https://steamcdn-a.akamaihd.net/steam/apps/${game.appId}/capsule_616x353.jpg`,
                        ]}
                        alt={game.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        fallbackLabel={game.name}
                    />

                    <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                <ReviewScoreBadge score={game.reviewPercentage} />

                <div className={cn(
                    "absolute top-2 left-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
                    "text-[10px] font-semibold shadow-xl",
                    "bg-black/80 backdrop-blur-md ring-1 ring-white/10",
                    typeConfig.color
                )}>
                    <TypeIcon className="size-2.5" />
                    {typeConfig.label}
                </div>

                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
                    <div className="flex items-center gap-1">
                        {game.owned && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                <CheckCircle2 className="size-2.5" />
                                Owned
                            </span>
                        )}

                        {game.isFree && (
                            <span className="inline-flex items-center rounded-md bg-primary/90 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground border border-primary/30">
                                Free
                            </span>
                        )}
                    </div>

                    {steamUrl && (
                        <Link
                            href={steamUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                        >
                            <ExternalLink className="size-2.5" /> Show on Steam
                        </Link>
                    )}
                </div>
            </div>

            <div className="flex flex-col flex-1 p-3.5 gap-2">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                        {game.name !== "" ? game.name : (
                            <span className="text-muted-foreground font-medium italic">No name</span>
                        )}
                    </h3>

                    <div className="flex shrink-0 items-center gap-1 group-hover:opacity-0 transition-opacity duration-150">
                        {game.owned && (
                            <Badge className="h-4 gap-1 border border-primary/40 bg-primary/15 px-1.5 py-0 text-[10px] text-primary">
                                <CheckCircle2 className="size-2.5" />
                                Owned
                            </Badge>
                        )}

                        {game.isFree && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0">
                                Free
                            </Badge>
                        )}
                    </div>
                </div>

                {game.shortDescription && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                        {game.shortDescription}
                    </p>
                )}

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <CalendarDays className="size-3 shrink-0" />
                        {game.releaseDate
                            ? new Date(game.releaseDate).toLocaleDateString(undefined, { year: "numeric", month: "short" })
                            : "TBA"}
                    </span>

                    {game.appId && (
                        <span className="flex items-center gap-1 tabular-nums opacity-50">
                            <CodeXml className="size-3 shrink-0" />
                            {game.appId}
                        </span>
                    )}
                </div>

                {(game.developers?.length > 0 || game.publishers?.length > 0) && (
                    <div className="space-y-0.5 text-[11px] text-muted-foreground">
                        {game.developers?.length > 0 && (
                            <div className="flex items-center gap-1.5 truncate">
                                <User className="size-3 shrink-0 opacity-60" />
                                <span className="truncate">{game.developers.join(", ")}</span>
                            </div>
                        )}

                        {game.publishers?.length > 0 && (
                            <div className="flex items-center gap-1.5 truncate">
                                <Building2 className="size-3 shrink-0 opacity-60" />
                                <span className="truncate">{game.publishers.join(", ")}</span>
                            </div>
                        )}
                    </div>
                )}

                {game.tags.length > 0 && (
                    <div className="flex items-start gap-1.5">
                        <Package2 className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-60" />
                        <ExpandablePills items={game.tags} max={4} variant="outline" />
                    </div>
                )}

                {game.categories?.length > 0 && (
                    <div className="flex items-start gap-1.5">
                        <Tag className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-60" />
                        <ExpandablePills items={game.categories} max={3} variant="secondary" />
                    </div>
                )}

                {game.tags?.length > 0 && (
                    <div className="flex items-start gap-1.5">
                        <Hash className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-60" />
                        <ExpandablePills items={game.tags} max={3} variant="outline" />
                    </div>
                )}

                <div className="flex items-center justify-between pt-1.5 mt-auto border-t border-border/20">
                    <PlatformIcons
                        platforms={game.platforms}
                        iconClassName="size-3.5 opacity-60 hover:text-foreground transition-colors"
                    />

                    <div className="flex items-center gap-1">
                        <AddToCollectionDropdown gameId={game.id} side="top" align="end">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground justify-start gap-2 h-8 cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Library className="size-3.5" />
                                <span className="text-xs">Add to Collection</span>
                            </Button>
                        </AddToCollectionDropdown>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SkeletonCard() {
    return (
        <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
            <div className="aspect-460/215 bg-muted animate-pulse" />
            <div className="p-3.5 space-y-2.5">
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded-md" />
                <div className="h-3 w-full bg-muted animate-pulse rounded-md" />
                <div className="h-3 w-2/3 bg-muted animate-pulse rounded-md" />
                <div className="flex gap-1.5 pt-1">
                    <div className="h-4 w-12 bg-muted animate-pulse rounded-md" />
                    <div className="h-4 w-16 bg-muted animate-pulse rounded-md" />
                    <div className="h-4 w-10 bg-muted animate-pulse rounded-md" />
                </div>
                <div className="flex gap-1.5">
                    <div className="h-4 w-14 bg-muted animate-pulse rounded-md" />
                    <div className="h-4 w-10 bg-muted animate-pulse rounded-md" />
                </div>
                <div className="h-px bg-border/20 mt-1" />
                <div className="flex justify-between items-center pt-0.5">
                    <div className="flex gap-2">
                        <div className="h-3.5 w-3.5 bg-muted animate-pulse rounded-sm" />
                        <div className="h-3.5 w-3.5 bg-muted animate-pulse rounded-sm" />
                    </div>
                    <div className="h-7 w-16 bg-muted animate-pulse rounded-md" />
                </div>
            </div>
        </div>
    );
}

export function CardGrid({
     data,
     total,
     page,
     pageSize,
     totalPages,
     onPageChange,
     onPageSizeChange,
     isLoading,
     isRefreshing
 }: CardGridProps) {
    const showSkeletons = isLoading && data.length === 0;

    return (
        <div className="relative space-y-6">
            {showSkeletons ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {Array.from({ length: Math.min(pageSize, 20) }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            ) : data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Package className="mb-4 size-10 text-muted-foreground/30" />
                    <p className="text-base font-medium text-muted-foreground">No games found</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">
                        Try adjusting your filters to see more results
                    </p>
                </div>
            ) : (
                <div className={cn(
                    "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 transition-all",
                    isRefreshing && "opacity-70 pointer-events-none"
                )}>
                    {data.map((game) => (
                        <GameCard key={game.id} game={game} />
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between px-1 pt-2 border-t border-border/20">
                <div className="text-sm text-muted-foreground">
                    {total > 0 ? (
                        <>
                            <span className="font-medium text-foreground">
                                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
                            </span>
                            <span className="mx-1">of</span>
                            <span className="font-medium text-foreground">{total.toLocaleString()}</span>
                            <span className="ml-1">games</span>
                        </>
                    ) : "No results"}
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Per page</span>
                        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                            <SelectTrigger className="h-8 w-18 bg-card/50 border-border/50 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[20, 40, 60].map((s) => (
                                    <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <TablePagination page={page} totalPages={totalPages || 1} onPageChange={onPageChange} />
                </div>
            </div>
        </div>
    );
}