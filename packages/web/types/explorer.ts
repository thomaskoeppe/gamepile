import {GameType, Platform} from "@/prisma/generated/enums";

export type ExplorerSortField =
    | "name"
    | "releaseDate"
    | "metacriticScore"
    | "type";

export type ExplorerSortDirection = "asc" | "desc";

export interface ExplorerSort {
    field: ExplorerSortField;
    direction: ExplorerSortDirection;
}

export type OwnershipFilter = "all" | "owned" | "unowned";

export interface ExplorerFilters {
    search: string;
    genreIds: string[];
    categoryIds: string[];
    platforms: Platform[];
    gameType: GameType | null;
    isFree: boolean | null;
    metacriticMin: number | null;
    metacriticMax: number | null;
    releaseDateFrom: string | null;
    releaseDateTo: string | null;
    ownership?: OwnershipFilter;
}

export interface ExplorerGameRow {
    id: string;
    appId: number | null;
    name: string;
    shortDescription: string | null;
    metacriticScore: number | null;
    isFree: boolean;
    releaseDate: Date | null;
    type: GameType;
    platforms: Platform[];
    developers: string[];
    publishers: string[];
    genres: { id: string; name: string }[];
    categories: { id: string; name: string }[];
    owned: boolean;
}

export interface ExplorerFilterOptions {
    genres: { id: string; name: string }[];
    categories: { id: string; name: string }[];
}

export type ExplorerViewMode = "table" | "grid";

