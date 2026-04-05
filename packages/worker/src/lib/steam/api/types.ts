import type { GameType } from "@/src/prisma/generated/enums.js";

/**
 * Represents a single item returned by the Steam IStoreBrowseService/GetItems API.
 *
 * Contains raw data including metadata, pricing, tags, categories, reviews,
 * platform info, assets, and release details as provided by the Steam Store API.
 */
export type StoreBrowseItem = {
    /** The type of store item (e.g., game, DLC, demo). */
    item_type: number;
    /** Unique identifier for the store item. */
    id: number;
    /** Whether the API call for this item succeeded (1 = success). */
    success: number;
    /** Whether the item is currently visible on the Steam Store. */
    visible?: boolean;
    /** Display name of the game or application. */
    name: string;
    /** URL path segment for the item's Steam Store page. */
    store_url_path?: string;
    /** Steam application ID. */
    appid: number;
    /** Numeric game type identifier (0 = game, 1 = DLC, 2 = demo, etc.). */
    type: number;
    /** Whether the item is free to play. */
    is_free?: boolean;
    /** Whether the item is currently in Early Access. */
    is_early_access?: boolean;
    /** Array of content descriptor IDs (e.g., mature content flags). */
    content_descriptorids?: number[];
    /** Array of tag IDs associated with this item. */
    tagids?: number[];
    /** Category groupings for the item. */
    categories?: {
        /** Multiplayer/co-op category IDs. */
        supported_player_categoryids?: number[];
        /** Feature category IDs (e.g., achievements, cloud saves). */
        feature_categoryids?: number[];
        /** Controller support category IDs. */
        controller_categoryids?: number[];
    };
    /** Basic metadata about the item (description, publishers, developers, franchises). */
    basic_info?: {
        /** Short description text of the item. */
        short_description?: string;
        /** List of publishers with optional creator clan account IDs. */
        publishers?: Array<{ name: string; creator_clan_account_id?: number }>;
        /** List of developers with optional creator clan account IDs. */
        developers?: Array<{ name: string; creator_clan_account_id?: number }>;
        /** List of franchise names the item belongs to. */
        franchises?: Array<{ name: string }>;
    };
    /** Weighted tags associated with the item. */
    tags?: Array<{ tagid: number; weight: number }>;
    /** Release information for the item. */
    release?: {
        /** Unix timestamp of the Steam release date. */
        steam_release_date?: number;
        /** Whether the item has not been released yet. */
        is_coming_soon?: boolean;
        /** Custom release date message (e.g., "Q2 2026"). */
        custom_release_date_message?: string;
        /** Display text for coming soon items. */
        coming_soon_display?: string;
        /** Whether the item is in Early Access. */
        is_early_access?: boolean;
    };
    /** Platform availability and compatibility information. */
    platforms?: {
        /** Whether the item supports Windows. */
        windows?: boolean;
        /** Whether the item supports macOS. */
        mac?: boolean;
        /** Whether the item supports SteamOS/Linux. */
        steamos_linux?: boolean;
        /** VR support metadata. */
        vr_support?: Record<string, unknown>;
        /** Steam Deck compatibility category (0–3). */
        steam_deck_compat_category?: number;
        /** SteamOS compatibility category. */
        steam_os_compat_category?: number;
    };
    /** User review summary data. */
    reviews?: {
        /** Filtered review summary (across all languages). */
        summary_filtered?: {
            /** Total number of reviews. */
            review_count?: number;
            /** Percentage of positive reviews. */
            percent_positive?: number;
            /** Numeric review score. */
            review_score?: number;
            /** Human-readable review score label (e.g., "Very Positive"). */
            review_score_label?: string;
        };
        /** Language-specific review summary. */
        summary_language_specific?: {
            review_count?: number;
            percent_positive?: number;
            review_score?: number;
            review_score_label?: string;
        };
    };
    /** Store asset URLs for images and capsules. */
    assets?: {
        /** URL format template with `${FILENAME}` placeholder. */
        asset_url_format?: string;
        /** Header image filename. */
        header?: string;
        /** Header image filename (2x resolution). */
        header_2x?: string;
        /** Main capsule image filename. */
        main_capsule?: string;
        /** Main capsule image filename (2x resolution). */
        main_capsule_2x?: string;
        /** Small capsule image filename. */
        small_capsule?: string;
        /** Library capsule image filename. */
        library_capsule?: string;
        /** Library capsule image filename (2x resolution). */
        library_capsule_2x?: string;
        /** Library hero image filename. */
        library_hero?: string;
        /** Library hero image filename (2x resolution). */
        library_hero_2x?: string;
        /** Hero capsule image filename. */
        hero_capsule?: string;
        /** Community icon filename. */
        community_icon?: string;
        /** Page background image filename. */
        page_background?: string;
        /** Optional explicit page background route path. */
        page_background_path?: string;
        /** Optional raw page background filename. */
        raw_page_background?: string;
    };
    /** Store asset URLs without user/content overrides applied. */
    assets_without_overrides?: {
        /** URL format template with `${FILENAME}` placeholder. */
        asset_url_format?: string;
        /** Header image filename. */
        header?: string;
        /** Header image filename (2x resolution). */
        header_2x?: string;
        /** Main capsule image filename. */
        main_capsule?: string;
        /** Main capsule image filename (2x resolution). */
        main_capsule_2x?: string;
        /** Small capsule image filename. */
        small_capsule?: string;
        /** Library capsule image filename. */
        library_capsule?: string;
        /** Library capsule image filename (2x resolution). */
        library_capsule_2x?: string;
        /** Library hero image filename. */
        library_hero?: string;
        /** Library hero image filename (2x resolution). */
        library_hero_2x?: string;
        /** Hero capsule image filename. */
        hero_capsule?: string;
        /** Community icon filename. */
        community_icon?: string;
        /** Page background image filename. */
        page_background?: string;
        /** Optional explicit page background route path. */
        page_background_path?: string;
        /** Optional raw page background filename. */
        raw_page_background?: string;
    };
    /** Full description of the item in BBCode format. */
    full_description_bbcode?: string;
    /** Whether the item has not been released yet (top-level field). */
    is_coming_soon?: boolean;
    /** Screenshot metadata for the item. */
    screenshots?: {
        /** Array of screenshot filenames with ordinal positions. */
        all_ages_screenshots?: Array<{
            /** Filename within the asset CDN. */
            filename: string;
            /** Display order. */
            ordinal: number;
        }>;
        /** Array of screenshot filenames with ordinal positions. */
        mature_content_screenshots?: Array<{
            /** Filename within the asset CDN. */
            filename: string;
            /** Display order. */
            ordinal: number;
        }>
    };
    /** Trailer/video metadata for the item. */
    trailers?: {
        /** Highlighted trailers (shown prominently on the store page). */
        highlights?: Array<StoreBrowseTrailer>;
    };
};

/**
 * Represents a single trailer returned by the Steam IStoreBrowseService API.
 */
export type StoreBrowseTrailer = {
    /** Display name of the trailer. */
    trailer_name?: string;
    /** Base URL template for trailer assets. */
    trailer_url_format?: string;
    /** Trailer category as returned by Steam. */
    trailer_category?: number;
    /** Stable trailer base identifier. */
    trailer_base_id?: number;
    /** Whether the trailer is suitable for all ages. */
    all_ages?: boolean;
    /** Poster/preview image path at medium resolution. */
    screenshot_medium?: string;
    /** Poster/preview image path at full resolution. */
    screenshot_full?: string;
    /** Short auto-playing preview clips. */
    microtrailer?: Array<{
       filename: string;
       type: string;
    }>;
    /** Available video formats and their filenames. */
    adaptive_trailers?: Array<{
       cdn_path: string;
       encoding: "dash_av1" | "dash_h264" | "hls_h264"
    }>;
};

/**
 * Response shape returned by the Steam IStoreBrowseService/GetItems API.
 */
export type StoreBrowseResponse = {
    response: {
        /** Array of store items returned by the API, or undefined if empty. */
        store_items?: StoreBrowseItem[];
    };
};

/**
 * Normalized game details extracted from a {@link StoreBrowseItem}.
 *
 * This is the internal representation used throughout the worker
 * for persisting game metadata to the database.
 */
export type StoreBrowseDetails = {
    /** Steam application ID. */
    appId: number;
    /** Display name of the game. */
    name: string;
    /** Mapped game type (GAME, DLC, DEMO, etc.). */
    type: GameType;
    /** Whether the game is free to play. */
    isFree: boolean;
    /** Whether the game is currently in Early Access. */
    isEarlyAccess: boolean;
    /** Short description text, or null if unavailable. */
    shortDescription: string | null;
    /** Full description in BBCode format, or null if unavailable. */
    fullDescription: string | null;
    /** List of developer names. */
    developers: string[];
    /** List of publisher names. */
    publishers: string[];
    /** List of franchise names. */
    franchises: string[];
    /** Release date of the game, or null if unreleased/unknown. */
    releaseDate: Date | null;
    /** Supported platforms. */
    platforms: Array<"WINDOWS" | "MAC" | "LINUX">;
    /** Array of Steam tag IDs associated with this game. */
    tagIds: number[];
    /** Array of resolved Steam tag names. */
    tagNames: string[];
    /** Array of Steam category IDs. */
    categoryIds: number[];
    /** Numeric review score, or null. */
    reviewScore: number | null;
    /** Percentage of positive reviews, or null. */
    reviewPercentage: number | null;
    /** Total number of reviews, or null. */
    reviewCount: number | null;
    /** Human-readable review score label (e.g., "Mostly Positive"), or null. */
    reviewScoreLabel: string | null;
    /** URL to the game's header image, or null. */
    headerImageUrl: string | null;
    /** URL to the game's main capsule image, or null. */
    capsuleImageUrl: string | null;
    /** URL to the game's library capsule image, or null. */
    libraryCapsuleUrl: string | null;
    /** URL to the game's library hero image, or null. */
    libraryHeroUrl: string | null;
    /** URL to the game's hero capsule image, or null. */
    heroCapsuleUrl: string | null;
    /** Steam Deck compatibility category (0–3), or null. */
    steamDeckCompat: number | null;
    /** Timestamp when these details were fetched from Steam. */
    detailsFetchedAt: Date;
    /** Resolved screenshot CDN URLs. */
    screenshotUrls: string[];
    /** Resolved HLS H.264 trailer URLs with optional title and thumbnail. */
    trailers: Array<{
        /** HLS H.264 streaming URL. */
        url: string;
        /** Display name of the trailer. */
        title: string | null;
    }>;
};

/**
 * Extracted review data from a {@link StoreBrowseItem}.
 */
export type ReviewData = {
    /** Numeric review score, or null. */
    reviewScore: number | null;
    /** Percentage of positive reviews, or null. */
    reviewPercentage: number | null;
    /** Total number of reviews, or null. */
    reviewCount: number | null;
    /** Human-readable review score label, or null. */
    reviewScoreLabel: string | null;
};

/**
 * Resolved asset URLs for a game's store images.
 */
export type AssetUrls = {
    /** Full URL to the header image, or null. */
    headerImageUrl: string | null;
    /** Full URL to the main capsule image, or null. */
    capsuleImageUrl: string | null;
    /** Full URL to the library capsule image, or null. */
    libraryCapsuleUrl: string | null;
    /** Full URL to the library hero image, or null. */
    libraryHeroUrl: string | null;
    /** Full URL to the hero capsule image, or null. */
    heroCapsuleUrl: string | null;
};

/**
 * Represents a single Steam tag from the IStoreService/GetTagList API.
 */
export type SteamTag = {
    /** Unique numeric tag ID. */
    tagid: number;
    /** Localized tag name. */
    name: string;
};

/**
 * Response shape returned by the Steam IStoreService/GetTagList API.
 */
export type TagListResponse = {
    response: {
        /** Version hash for cache invalidation. */
        version_hash?: string;
        /** Array of available Steam tags. */
        tags?: SteamTag[];
    };
};

/**
 * Represents a single Steam store category from the IStoreBrowseService/GetStoreCategories API.
 */
export type SteamCategory = {
    /** Unique numeric category ID. */
    categoryid: number;
    /** Numeric type identifier for the category. */
    type: number;
    /** Internal machine-readable category name. */
    internal_name: string;
    /** Human-readable display name. */
    display_name: string;
    /** URL to the category icon image. */
    image_url?: string;
    /** Whether this category is shown in search filters. */
    show_in_search?: boolean;
};

/**
 * Response shape returned by the Steam IStoreBrowseService/GetStoreCategories API.
 */
export type StoreCategoriesResponse = {
    response: {
        /** Array of available store categories. */
        categories?: SteamCategory[];
    };
};

