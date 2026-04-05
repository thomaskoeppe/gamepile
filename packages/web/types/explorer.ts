import {GameType, Platform} from "@/prisma/generated/enums";

export type ExplorerSortField =
    | "name"
    | "releaseDate"
    | "reviewScore"
    | "type";

export type ExplorerSortDirection = "asc" | "desc";

export interface ExplorerSort {
    field: ExplorerSortField;
    direction: ExplorerSortDirection;
}

export type OwnershipFilter = "all" | "owned" | "unowned";

export interface ExplorerFilters {
    search: string;
    categoryIds: string[];
    tagIds: string[];
    platforms: Platform[];
    gameType: GameType | null;
    isFree: boolean | null;
    reviewScoreMin: number | null;
    reviewScoreMax: number | null;
    releaseDateFrom: string | null;
    releaseDateTo: string | null;
    ownership?: OwnershipFilter;
}

export interface ExplorerGameRow {
    id: string;
    appId: number | null;
    name: string;
    shortDescription: string | null;
    reviewScore: number | null;
    reviewPercentage: number | null;
    reviewCount: number | null;
    reviewScoreLabel: string | null;
    isFree: boolean;
    releaseDate: Date | null;
    type: GameType;
    platforms: Platform[];
    developers: string[];
    publishers: string[];
    categories: { id: string; name: string }[];
    tags: { id: string; name: string }[];
    owned: boolean;
}

export interface ExplorerFilterOptions {
    categories: { id: string; name: string }[];
    tags: { id: string; name: string }[];
}

export type ExplorerViewMode = "table" | "grid";
