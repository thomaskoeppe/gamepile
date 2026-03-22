import {
    Archive, Clock,
    FolderOpen,
    Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {useCallback, useEffect, useState, useTransition} from "react";

import {GameDetailDialog} from "@/components/game/game-detail-dialog";
import {SafeImage} from "@/components/safe-image";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {Skeleton} from "@/components/ui/skeleton";
import {
    getRecentSearches,
    RecentSearch,
    search,
    SearchResult,
    SearchResults
} from "@/lib/actions/search";
import { browserLog } from "@/lib/browser-logger";
import {cn} from "@/lib/utils";

export function SearchTrigger({ onClick, className }: { onClick: () => void; className?: string }) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                onClick();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClick]);

    return (
        <button
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-2 rounded-lg border bg-card/50 px-3 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                className
            )}
        >
            <Search className="size-4" />
            <span className="hidden sm:inline-flex">Search games, collections...</span>
            <span className="sm:hidden">Search</span>
            <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
                <span className="text-xs">⌘</span>K
            </kbd>
        </button>
    );
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResults | null>(null);
    const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
    const [isPending, startTransition] = useTransition();
    const [gameDialog, setGameDialog] = useState<SearchResult | null>(null);

    useEffect(() => {
        if (open) {
            getRecentSearches().then(setRecentSearches);
        }
    }, [open]);

    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            startTransition(async () => {
                if (!query.trim()) {
                    setResults(null);
                    return;
                }
                browserLog.debug('Search query submitted', { query: query.trim() });
                const searchResults = await search(query);
                browserLog.debug('Search results received', { query: query.trim(), totalCount: searchResults?.totalCount ?? 0 });
                setResults(searchResults);
            });
        }, 500);

        return () => clearTimeout(debounceTimer);
    }, [query]);

    const navigateAndClose = useCallback((path: string) => {
        browserLog.info('Search result navigated', { path });
        onOpenChange(false);
        setQuery("");
        router.push(path);
    }, [onOpenChange, router]);

    const handleSelect = useCallback((result: SearchResult) => {
        browserLog.info('Search result selected', { type: result.type, id: result.id, name: result.name });
        switch (result.type) {
            case "game":
                setGameDialog(result);
                return;
            case "collection":
                navigateAndClose(`/collections/${result.id}`);
                return;
            case "vault":
                navigateAndClose(`/vaults/${result.id}`);
                return;
            case "category":
                navigateAndClose(`/explore?categoryIds=${result.id}`);
                return;
            case "genre":
                navigateAndClose(`/explore?genreIds=${result.id}`);
                return;
        }
    }, [navigateAndClose]);

    const handleQuickSearch = useCallback((term: string) => {
        browserLog.info('Recent search selected', { term });
        setQuery(term);
    }, []);

    const hasResults = results && results.totalCount > 0;
    const showSuggestions = !query.trim() && !results;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogHeader className="sr-only">
                    <DialogTitle>Search</DialogTitle>
                    <DialogDescription>Search for games, collections, vaults, categories, and genres</DialogDescription>
                </DialogHeader>

                <DialogContent className="overflow-hidden p-0 sm:max-w-2xl" showCloseButton={false}>
                    <Command shouldFilter={false} className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground">
                        <div className="flex items-center border-b px-3">
                            <Search className="mr-2 size-4 shrink-0 opacity-50" />
                            <CommandInput
                                placeholder="Search games, collections, categories..."
                                value={query}
                                onValueChange={setQuery}
                                className="border-0 focus:ring-0"
                            />
                            {isPending && (
                                <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">Searching...</span>
                                </div>
                            )}
                        </div>

                        <CommandList className="max-h-100">
                            {isPending && query && (
                                <div className="p-4 space-y-3">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-8 w-3/4" />
                                </div>
                            )}

                            {!isPending && query && results && results.totalCount === 0 && (
                                <CommandEmpty className="py-12">
                                    <div className="flex flex-col items-center gap-2">
                                        <Search className="size-10 text-muted-foreground/50" />
                                        <p className="text-muted-foreground">No results found for &quot;{query}&quot;</p>
                                        <p className="text-xs text-muted-foreground/70">Try searching for game names, app IDs, or categories</p>
                                    </div>
                                </CommandEmpty>
                            )}

                            {showSuggestions && (
                                <>
                                    {recentSearches.length > 0 && (
                                        <CommandGroup heading="Recent Searches">
                                            {recentSearches.map((term) => (
                                                <CommandItem
                                                    key={`recent-${term.query}`}
                                                    value={`recent-${term.query}`}
                                                    onSelect={() => handleQuickSearch(term.query)}
                                                    className="cursor-pointer"
                                                >
                                                    <Clock className="mr-2 size-4 text-muted-foreground" />
                                                    <span>{term.query}</span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    )}
                                </>
                            )}

                            {!isPending && hasResults && (
                                <>
                                    {results.games.length > 0 && (
                                        <CommandGroup heading="Games">
                                            {results.games.map((game) => (
                                                <CommandItem
                                                    key={game.id}
                                                    value={game.id}
                                                    onSelect={() => handleSelect(game)}
                                                    className="cursor-pointer py-2"
                                                >
                                                    <div className="flex items-center gap-3 w-full">
                                                        <div className="relative w-24 h-9 shrink-0 overflow-hidden rounded-md bg-muted">
                                                            <SafeImage
                                                                srcs={[
                                                                    `https://steamcdn-a.akamaihd.net/steam/apps/${game.appId}/header.jpg`,
                                                                    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appId}/library_hero.jpg`,
                                                                ]}
                                                                alt={game.name}
                                                                className="object-cover rounded-md"
                                                                fill
                                                                sizes="96px"
                                                                fallbackLabel={game.name}
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium truncate">{game.name}</span>
                                                                {game.metadata?.isFree && (
                                                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Free</Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                <span>App ID: {game.appId}</span>
                                                                {game.metadata?.metacriticScore ? (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={cn(
                                                                            "text-[10px] px-1 py-0",
                                                                            Number(game.metadata.metacriticScore) >= 75 && "border-green-500 text-green-500",
                                                                            Number(game.metadata.metacriticScore) >= 50 && Number(game.metadata.metacriticScore) < 75 && "border-yellow-500 text-yellow-500",
                                                                            Number(game.metadata.metacriticScore) < 50 && "border-red-500 text-red-500"
                                                                        )}
                                                                    >
                                                                        {game.metadata.metacriticScore.toString()}
                                                                    </Badge>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    )}

                                    {results.collections.length > 0 && (
                                        <>
                                            <CommandSeparator />
                                            <CommandGroup heading="Collections">
                                                {results.collections.map((collection) => (
                                                    <CommandItem
                                                        key={collection.id}
                                                        value={collection.id}
                                                        onSelect={() => handleSelect(collection)}
                                                        className="cursor-pointer py-2"
                                                    >
                                                        <div className="flex items-center gap-3 w-full">
                                                            <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted flex justify-center items-center">
                                                                <FolderOpen className="size-6 text-muted-foreground shrink-0" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="font-medium truncate block">{collection.name}</span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {collection.metadata?.gameCount.toString()} games
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </>
                                    )}

                                    {results.vaults.length > 0 && (
                                        <>
                                            <CommandSeparator />
                                            <CommandGroup heading="Vaults">
                                                {results.vaults.map((vault) => (
                                                    <CommandItem
                                                        key={vault.id}
                                                        value={vault.id}
                                                        onSelect={() => handleSelect(vault)}
                                                        className="cursor-pointer py-2"
                                                    >
                                                        <div className="flex items-center gap-3 w-full">
                                                            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                                                                <Archive className="size-5 text-muted-foreground" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="font-medium truncate block">{vault.name}</span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {vault.metadata?.itemCount.toString()} items
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </>
                                    )}

                                    {results.categories.length > 0 && (
                                        <>
                                            <CommandSeparator />
                                            <CommandGroup heading="Categories">
                                                <div className="flex flex-wrap gap-1.5 p-2">
                                                    {results.categories.map((category) => {
                                                        return (
                                                            <button
                                                                key={category.id}
                                                                onClick={() => handleSelect(category)}
                                                                className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                                                            >
                                                                {category.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </CommandGroup>
                                        </>
                                    )}

                                    {results.genres.length > 0 && (
                                        <>
                                            <CommandSeparator />
                                            <CommandGroup heading="Genres">
                                                <div className="flex flex-wrap gap-1.5 p-2">
                                                    {results.genres.map((genre) => {
                                                        return (
                                                            <button
                                                                key={genre.id}
                                                                onClick={() => handleSelect(genre)}
                                                                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                                                            >
                                                                {genre.name}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </CommandGroup>
                                        </>
                                    )}
                                </>
                            )}
                        </CommandList>

                        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      <span className="text-xs">↑↓</span>
                    </kbd>
                    Navigate
                  </span>
                                <span className="flex items-center gap-1">
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      ↵
                    </kbd>
                    Select
                  </span>
                                <span className="flex items-center gap-1">
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      esc
                    </kbd>
                    Close
                  </span>
                            </div>
                            {results && results.totalCount > 0 && (
                                <span>{results.totalCount} results</span>
                            )}
                        </div>
                    </Command>
                </DialogContent>
            </Dialog>

            <GameDetailDialog
                game={gameDialog}
                open={gameDialog !== null}
                onOpenChange={(open) => { if (!open) setGameDialog(null); }}
            />
        </>
    );
}
