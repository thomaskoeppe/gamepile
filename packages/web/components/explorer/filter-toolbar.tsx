"use client";

import {RotateCcw, Search} from "lucide-react";
import {Calendar, ChevronDown,SlidersHorizontal} from "lucide-react";
import {useCallback, useState} from "react";

import {MultiSelectCombobox} from "@/components/multi-select-combobox";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Slider} from "@/components/ui/slider";
import { browserLog } from "@/lib/browser-logger";
import {cn} from "@/lib/utils";
import {GameType, Platform} from "@/prisma/generated/enums";
import type {ExplorerFilterOptions, ExplorerFilters, OwnershipFilter} from "@/types/explorer";

interface FilterToolbarProps {
    filters: ExplorerFilters;
    onChange: (filters: ExplorerFilters) => void;
    options: ExplorerFilterOptions;
}

const PLATFORM_LABELS: Record<string, string> = {
    WINDOWS: "Windows",
    MAC: "macOS",
    LINUX: "Linux",
};

const MIN_YEAR = 1980;
const STABLE_CURRENT_YEAR = new Date().getFullYear();
const STABLE_MAX_YEAR = STABLE_CURRENT_YEAR + 2;

function MetacriticRangeFilter({
                                   min,
                                   max,
                                   onMinChange,
                                   onMaxChange,
                               }: {
    min: number | null;
    max: number | null;
    onMinChange: (value: number | null) => void;
    onMaxChange: (value: number | null) => void;
}) {
    const [localValues, setLocalValues] = useState<[number, number]>([
        min ?? 0,
        max ?? 100,
    ]);

    const hasFilter = min !== null || max !== null;

    const handleSliderChange = (values: number[]) => {
        setLocalValues([values[0], values[1]]);
    };

    const handleSliderCommit = (values: number[]) => {
        const newMin = values[0] === 0 ? null : values[0];
        const newMax = values[1] === 100 ? null : values[1];
        onMinChange(newMin);
        onMaxChange(newMax);
    };

    const getScoreColor = (score: number) => {
        if (score >= 75) return "text-green-500";
        if (score >= 50) return "text-yellow-500";
        return "text-red-500";
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        "h-9 gap-2 border-border/50 bg-card/50 hover:bg-card/80 hover:border-border",
                        hasFilter && "border-primary/50 bg-primary/5"
                    )}
                >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="text-sm">Metacritic</span>
                    {hasFilter && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20">
                            {min ?? 0}–{max ?? 100}
                        </Badge>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" align="start">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Score Range</Label>
                        {hasFilter && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                    onMinChange(null);
                                    onMaxChange(null);
                                    setLocalValues([0, 100]);
                                }}
                            >
                                Reset
                            </Button>
                        )}
                    </div>

                    <div className="space-y-3">
                        <Slider
                            value={localValues}
                            min={0}
                            max={100}
                            step={5}
                            onValueChange={handleSliderChange}
                            onValueCommit={handleSliderCommit}
                            className="w-full"
                        />

                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Min:</span>
                                <span className={cn("font-medium", getScoreColor(localValues[0]))}>
                  {localValues[0]}
                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Max:</span>
                                <span className={cn("font-medium", getScoreColor(localValues[1]))}>
                  {localValues[1]}
                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full bg-red-500" />
                            <span>0-49</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full bg-yellow-500" />
                            <span>50-74</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            <span>75-100</span>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function ReleaseDateFilter({
                               fromDate,
                               toDate,
                               onFromChange,
                               onToChange,
                           }: {
    fromDate: string | null;
    toDate: string | null;
    onFromChange: (value: string | null) => void;
    onToChange: (value: string | null) => void;
}) {
    const [mode, setMode] = useState<"before" | "after" | "range">(
        fromDate && toDate ? "range" : fromDate ? "after" : toDate ? "before" : "range"
    );

    const getYearFromDate = (date: string | null): number => {
        if (!date) return STABLE_CURRENT_YEAR;
        return new Date(date).getFullYear();
    };

    const [selectedYear, setSelectedYear] = useState<number>(
        mode === "before" ? getYearFromDate(toDate) :
            mode === "after" ? getYearFromDate(fromDate) :
                STABLE_CURRENT_YEAR
    );

    const [yearRange, setYearRange] = useState<[number, number]>([
        fromDate ? getYearFromDate(fromDate) : MIN_YEAR + 20,
        toDate ? getYearFromDate(toDate) : STABLE_CURRENT_YEAR,
    ]);

    const hasFilter = fromDate !== null || toDate !== null;

    const handleModeChange = (newMode: "before" | "after" | "range") => {
        setMode(newMode);
        onFromChange(null);
        onToChange(null);
    };

    const handleYearChange = (values: number[]) => {
        if (mode === "range") {
            setYearRange([values[0], values[1]]);
        } else {
            setSelectedYear(values[0]);
        }
    };

    const handleYearCommit = (values: number[]) => {
        if (mode === "before") {
            onFromChange(null);
            onToChange(`${values[0]}-12-31`);
        } else if (mode === "after") {
            onFromChange(`${values[0]}-01-01`);
            onToChange(null);
        } else {
            onFromChange(`${values[0]}-01-01`);
            onToChange(`${values[1]}-12-31`);
        }
    };

    const getFilterLabel = () => {
        if (!hasFilter) return null;
        if (mode === "before" && toDate) {
            return `Before ${getYearFromDate(toDate)}`;
        }
        if (mode === "after" && fromDate) {
            return `After ${getYearFromDate(fromDate)}`;
        }
        if (fromDate && toDate) {
            return `${getYearFromDate(fromDate)}–${getYearFromDate(toDate)}`;
        }
        return null;
    };

    const filterLabel = getFilterLabel();

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        "h-9 gap-2 border-border/50 bg-card/50 hover:bg-card/80 hover:border-border",
                        hasFilter && "border-primary/50 bg-primary/5"
                    )}
                >
                    <Calendar className="h-3.5 w-3.5" />
                    <span className="text-sm">Release Year</span>
                    {filterLabel && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20">
                            {filterLabel}
                        </Badge>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Filter by Year</Label>
                        {hasFilter && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                    onFromChange(null);
                                    onToChange(null);
                                    setSelectedYear(STABLE_CURRENT_YEAR);
                                    setYearRange([MIN_YEAR + 20, STABLE_CURRENT_YEAR]);
                                }}
                            >
                                Reset
                            </Button>
                        )}
                    </div>

                    {/* Mode toggle */}
                    <div className="flex rounded-lg border border-border/50 p-0.5 bg-muted/30">
                        {(["before", "after", "range"] as const).map((m) => (
                            <Button
                                key={m}
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "flex-1 h-7 text-xs font-medium rounded-md transition-all",
                                    mode === m
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                                )}
                                onClick={() => handleModeChange(m)}
                            >
                                {m === "before" ? "Before" : m === "after" ? "After" : "Range"}
                            </Button>
                        ))}
                    </div>

                    <div className="space-y-3">
                        {mode === "range" ? (
                            <>
                                <Slider
                                    value={yearRange}
                                    min={MIN_YEAR}
                                    max={STABLE_MAX_YEAR}
                                    step={1}
                                    onValueChange={handleYearChange}
                                    onValueCommit={handleYearCommit}
                                    className="w-full"
                                />
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-muted-foreground">From:</span>
                                        <span className="font-medium">{yearRange[0]}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-muted-foreground">To:</span>
                                        <span className="font-medium">{yearRange[1]}</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <Slider
                                    value={[selectedYear]}
                                    min={MIN_YEAR}
                                    max={STABLE_MAX_YEAR}
                                    step={1}
                                    onValueChange={handleYearChange}
                                    onValueCommit={handleYearCommit}
                                    className="w-full"
                                />
                                <div className="flex items-center justify-center text-sm">
                  <span className="text-muted-foreground mr-1.5">
                    {mode === "before" ? "Released before" : "Released after"}
                  </span>
                                    <span className="font-medium">{selectedYear}</span>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                        <span>{MIN_YEAR}</span>
                        <span>{STABLE_MAX_YEAR}</span>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function FilterToolbar({filters, onChange, options}: FilterToolbarProps) {
    const update = useCallback(
        (patch: Partial<ExplorerFilters>) => onChange({...filters, ...patch}),
        [filters, onChange],
    );

    const clearAll = useCallback(() => {
        browserLog.info('Explorer filters cleared', { component: 'FilterToolbar' });
        onChange({
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
        });
    }, [onChange]);

    const activeFilterCount = [
        filters.genreIds && filters.genreIds.length > 0,
        filters.categoryIds && filters.categoryIds.length > 0,
        filters.platforms && filters.platforms.length > 0,
        !!filters.gameType,
        filters.isFree != null,
        filters.metacriticMin != null || filters.metacriticMax != null,
        !!filters.releaseDateFrom || !!filters.releaseDateTo,
        filters.ownership && filters.ownership !== "all",
    ].filter(Boolean).length;

    const hasActiveFilters = activeFilterCount > 0 || (filters.search && filters.search.length > 0);

    return (
        <div className="space-y-3">
            {/* Search bar row */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search games..."
                        value={filters.search ?? ""}
                        onChange={(e) => update({ search: e.target.value })}
                        className="pl-9 h-9 bg-card/50 border-border/50 focus-visible:border-primary focus-visible:ring-primary/20"
                    />
                </div>

                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAll}
                        className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Clear all
                        {activeFilterCount > 0 && (
                            <Badge variant="secondary" className="h-5 w-5 p-0 justify-center text-[10px]">
                                {activeFilterCount}
                            </Badge>
                        )}
                    </Button>
                )}
            </div>

            {/* Filter row */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Quick filters */}
                <Select
                    value={filters.ownership ?? "all"}
                    onValueChange={(v) => update({ ownership: v as OwnershipFilter })}
                >
                    <SelectTrigger className="w-32.5 h-9 bg-card/50 border-border/50">
                        <SelectValue placeholder="Ownership" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Games</SelectItem>
                        <SelectItem value="owned">Owned</SelectItem>
                        <SelectItem value="unowned">Not Owned</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filters.isFree == null ? "any" : filters.isFree ? "free" : "paid"}
                    onValueChange={(v) => update({ isFree: v === "any" ? null : v === "free" })}
                >
                    <SelectTrigger className="w-27.5 h-9 bg-card/50 border-border/50">
                        <SelectValue placeholder="Pricing" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any">Any Price</SelectItem>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filters.gameType ?? ""}
                    onValueChange={(v) => update({ gameType: v === "all" ? null : v as GameType })}
                >
                    <SelectTrigger className="w-30 h-9 bg-card/50 border-border/50">
                        <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {Object.values(GameType).map((t) => (
                            <SelectItem key={t} value={t}>
                                {t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="h-6 w-px bg-border/50 mx-1" />

                <MultiSelectCombobox
                    options={options.genres.map((g) => ({ value: g.id, label: g.name }))}
                    selected={filters.genreIds ?? []}
                    onChange={(v) => update({ genreIds: v })}
                    placeholder="Genres"
                    searchPlaceholder="Search genres..."
                    className="w-40"
                    maxDisplayedTags={1}
                />

                <MultiSelectCombobox
                    options={options.categories.map((c) => ({ value: c.id, label: c.name }))}
                    selected={filters.categoryIds ?? []}
                    onChange={(v) => update({ categoryIds: v })}
                    placeholder="Categories"
                    searchPlaceholder="Search categories..."
                    className="w-40"
                    maxDisplayedTags={1}
                />

                <MultiSelectCombobox
                    options={Object.values(Platform).map((p) => ({
                        value: p,
                        label: PLATFORM_LABELS[p] ?? p,
                    }))}
                    selected={filters.platforms ?? []}
                    onChange={(v) => update({ platforms: v as Platform[] })}
                    placeholder="Platforms"
                    className="w-37.5"
                    maxDisplayedTags={1}
                />

                <div className="h-6 w-px bg-border/50 mx-1" />

                <MetacriticRangeFilter
                    min={filters.metacriticMin}
                    max={filters.metacriticMax}
                    onMinChange={(v) => update({ metacriticMin: v })}
                    onMaxChange={(v) => update({ metacriticMax: v })}
                />

                <ReleaseDateFilter
                    fromDate={filters.releaseDateFrom}
                    toDate={filters.releaseDateTo}
                    onFromChange={(v) => update({ releaseDateFrom: v })}
                    onToChange={(v) => update({ releaseDateTo: v })}
                />
            </div>
        </div>
    );
}

