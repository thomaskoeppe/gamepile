"use client";

import { LayoutGrid, List } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { CardGrid } from "@/components/explorer/card-grid";
import { DataTable } from "@/components/explorer/data-table";
import { FilterToolbar } from "@/components/explorer/filter-toolbar";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { cn } from "@/lib/utils";
import { getExplorerFilterOptions,getExplorerGames } from "@/server/queries/explorer";
import type {
    ExplorerFilters,
    ExplorerSort,
    ExplorerSortDirection,
    ExplorerSortField,
    ExplorerViewMode,
} from "@/types/explorer";

const DEFAULT_FILTERS: ExplorerFilters = {
    search: "",
    genreIds: [],
    categoryIds: [],
    platforms: [],
    gameType: null,
    isFree: null,
    metacriticMin: null,
    metacriticMax: null,
    releaseDateFrom: null,
    releaseDateTo: null,
    ownership: "all",
};

const DEFAULT_SORT: ExplorerSort = { field: "name", direction: "asc" };

function parseInitialFilters(params: URLSearchParams): ExplorerFilters {
    const filters = { ...DEFAULT_FILTERS };
    const search = params.get("search");
    const genreIds = params.get("genreIds");
    const categoryIds = params.get("categoryIds");
    if (search) filters.search = search;
    if (genreIds) filters.genreIds = genreIds.split(",");
    if (categoryIds) filters.categoryIds = categoryIds.split(",");
    return filters;
}

export default function ExplorePage() {
    const searchParams = useSearchParams();
    const [filters, setFilters] = useState<ExplorerFilters>(() => parseInitialFilters(searchParams));
    const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("search") ?? "");
    const [sort, setSort] = useState<ExplorerSort>(DEFAULT_SORT);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [viewMode, setViewMode] = useState<ExplorerViewMode>("grid");
    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { data: filterOptionsResult } = useServerQuery(
        ["explorer-filter-options"],
        () => getExplorerFilterOptions()
    );

    const filterOptions = filterOptionsResult?.success
        ? filterOptionsResult.data
        : { genres: [], categories: [] };

    const activeFilters = { ...filters, search: debouncedSearch };

    const { data: gamesResult, isLoading, isValidating } = useServerQuery(
        ["explorer-games", activeFilters, sort, page, pageSize],
        () => getExplorerGames({ filters: activeFilters, sort, pagination: { page, pageSize } }),
        { keepPreviousData: true }
    );

    const response = gamesResult?.success
        ? gamesResult.data
        : { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };

    const isInitialLoading = isLoading && !gamesResult;
    const isRefreshing = isValidating && !!gamesResult;

    const handleFiltersChange = useCallback((newFilters: ExplorerFilters) => {
        setFilters(newFilters);
        setPage(1);

        if (newFilters.search !== filters.search) {
            if (searchDebounce.current) clearTimeout(searchDebounce.current);
            searchDebounce.current = setTimeout(() => {
                setDebouncedSearch(newFilters.search);
            }, 400);
        } else {
            setDebouncedSearch(filters.search);
        }
    }, [filters.search]);

    const handleSort = useCallback((field: string) => {
        setSort((prev) => ({
            field: field as ExplorerSortField,
            direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
        }));
        setPage(1);
    }, []);

    const handleSortSelect = useCallback((value: string) => {
        const [field, direction] = value.split("_") as [ExplorerSortField, ExplorerSortDirection];
        setSort({ field, direction });
        setPage(1);
    }, []);

    const handlePageChange = useCallback((p: number) => {
        setPage(p);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, []);

    const handlePageSizeChange = useCallback((ps: number) => {
        setPageSize(ps);
        setPage(1);
    }, []);

    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Game Explorer</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Browse and discover games from the database
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Select
                            value={`${sort.field}_${sort.direction}`}
                            onValueChange={handleSortSelect}
                        >
                            <SelectTrigger className="w-45 bg-card/50 border-border">
                                <SelectValue placeholder="Sort by..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                                <SelectItem value="name_desc">Name (Z–A)</SelectItem>
                                <SelectItem value="releaseDate_desc">Release (Newest)</SelectItem>
                                <SelectItem value="releaseDate_asc">Release (Oldest)</SelectItem>
                                <SelectItem value="metacriticScore_desc">Metacritic (High)</SelectItem>
                                <SelectItem value="metacriticScore_asc">Metacritic (Low)</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex rounded-lg border border-border overflow-hidden">
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-9 w-9 rounded-none border-r border-border",
                                    viewMode === "grid" && "bg-muted text-primary",
                                )}
                                onClick={() => setViewMode("grid")}
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-9 w-9 rounded-none",
                                    viewMode === "table" && "bg-muted text-primary",
                                )}
                                onClick={() => setViewMode("table")}
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                <FilterToolbar
                    filters={filters}
                    onChange={handleFiltersChange}
                    options={filterOptions}
                />

                {viewMode === "table" ? (
                    <DataTable
                        data={response.data}
                        total={response.total}
                        page={page}
                        pageSize={pageSize}
                        totalPages={response.totalPages}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        onSort={handleSort}
                        isLoading={isInitialLoading}
                        isRefreshing={isRefreshing}
                    />
                ) : (
                    <CardGrid
                        data={response.data}
                        total={response.total}
                        page={page}
                        pageSize={pageSize}
                        totalPages={response.totalPages}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        isLoading={isInitialLoading}
                        isRefreshing={isRefreshing}
                    />
                )}
            </div>
        </>
    );
}