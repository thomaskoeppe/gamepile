"use client";

import { RotateCcw, Search } from "lucide-react";
import { useCallback } from "react";

import { MultiSelectCombobox } from "@/components/shared/multi-select-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { browserLog } from "@/lib/browser-logger";
import {cn} from "@/lib/utils";
import { GameType, Platform } from "@/prisma/generated/enums";
import type { ExplorerFilterOptions, ExplorerFilters, OwnershipFilter } from "@/types/explorer";

import { ReleaseDateFilter } from "./release-date-filter";
import { ReviewScoreFilter } from "./review-score-filter";

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

export function FilterToolbar({ filters, onChange, options }: FilterToolbarProps) {
  const update = useCallback(
    (patch: Partial<ExplorerFilters>) => onChange({ ...filters, ...patch }),
    [filters, onChange]
  );

  const clearAll = useCallback(() => {
    browserLog.info("Explorer filters cleared", { component: "FilterToolbar" });
    onChange({
      search: "",
      categoryIds: [],
      tagIds: [],
      platforms: [],
      gameType: null,
      isFree: null,
      reviewScoreMin: null,
      reviewScoreMax: null,
      releaseDateFrom: null,
      releaseDateTo: null,
      ownership: "all",
    });
  }, [onChange]);

  const activeFilterCount = [
    filters.categoryIds && filters.categoryIds.length > 0,
    filters.tagIds && filters.tagIds.length > 0,
    filters.platforms && filters.platforms.length > 0,
    !!filters.gameType,
    filters.isFree != null,
    filters.reviewScoreMin != null || filters.reviewScoreMax != null,
    !!filters.releaseDateFrom || !!filters.releaseDateTo,
    filters.ownership && filters.ownership !== "all",
  ].filter(Boolean).length;

  const hasActiveFilters = activeFilterCount > 0 || (filters.search && filters.search.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search games..."
            value={filters.search ?? ""}
            onChange={(e) => update({ search: e.target.value })}
            className="h-9 border-border/50 bg-card/50 pl-9 focus-visible:border-primary focus-visible:ring-primary/20"
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
              <Badge variant="secondary" className="h-5 w-5 justify-center p-0 text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.ownership ?? "all"}
          onValueChange={(v) => update({ ownership: v as OwnershipFilter })}
        >
          <SelectTrigger className={cn(
            "h-9 w-32.5 border-border/50 bg-card/50",
            (filters.ownership ?? "all") === "all" && "text-muted-foreground"
          )}>
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
          <SelectTrigger className={cn(
            "h-9 w-33 border-border/50 bg-card/50",
            filters.isFree == null && "text-muted-foreground"
          )}>
            <SelectValue placeholder="Pricing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Price</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.gameType ?? "all"}
          onValueChange={(v) => update({ gameType: v === "all" ? null : (v as GameType) })}
        >
          <SelectTrigger className={cn(
            "h-9 w-30 border-border/50 bg-card/50",
            !filters.gameType && "text-muted-foreground"
          )}>
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

        <div className="mx-1 h-6 w-px bg-border/50" />


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
          options={options.tags.map((t) => ({ value: t.id, label: t.name }))}
          selected={filters.tagIds ?? []}
          onChange={(v) => update({ tagIds: v })}
          placeholder="Tags"
          searchPlaceholder="Search tags..."
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

        <div className="mx-1 h-6 w-px bg-border/50" />

        <ReviewScoreFilter
          key={`review:${filters.reviewScoreMin ?? "null"}:${filters.reviewScoreMax ?? "null"}`}
          min={filters.reviewScoreMin}
          max={filters.reviewScoreMax}
          onChange={({ min, max }) => update({ reviewScoreMin: min, reviewScoreMax: max })}
        />

        <ReleaseDateFilter
          key={`release:${filters.releaseDateFrom ?? "null"}:${filters.releaseDateTo ?? "null"}`}
          fromDate={filters.releaseDateFrom}
          toDate={filters.releaseDateTo}
          onChange={({ fromDate, toDate }) => update({ releaseDateFrom: fromDate, releaseDateTo: toDate })}
        />
      </div>
    </div>
  );
}
