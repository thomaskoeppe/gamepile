export type SteamAppDetails = {
    type: "game" | "dlc" | "demo" | "mod" | "advertising" | string;
    name: string;
    steam_appid: number;
    required_age: string;
    is_free: boolean;
    dlc?: number[];
    detailed_description: string;
    about_the_game: string;
    short_description: string;
    supported_languages: string;
    header_image: string;
    capsule_image: string;
    capsule_imagev5: string;
    website: string;
    pc_requirements: {
        minimum: string;
        recommended: string;
    };
    mac_requirements: {
        minimum: string;
        recommended: string;
    };
    linux_requirements: {
        minimum: string;
        recommended: string;
    };
    developers: string[];
    publishers: string[];
    price_overview?: {
        currency: string;
        initial: number;
        final: number;
        discount_percent: number;
        initial_formatted: string;
        final_formatted: string;
    };
    packages: number[];
    package_groups: unknown[];
    platforms: {
        windows: boolean;
        mac: boolean;
        linux: boolean;
    };
    metacritic?: {
        score: number;
        url: string;
    };
    categories: {
        id: number;
        description: string;
    }[];
    genres: {
        id: string;
        description: string;
    }[];
    screenshots: {
        id: number;
        path_thumbnail: string;
        path_full: string;
    }[];
    movies: {
        id: number;
        name: string;
        thumbnail: string;
        webm: {
            '480': string;
            'max': string;
        };
        mp4: {
            '480': string;
            'max': string;
        };
        dash_av1: string;
        dash_h264: string;
        hls_h264: string;
        highlight: boolean;
    }[];
    recommendations: {
        total: number;
    };
    achievements?: {
        total: number;
        highlighted: {
            name: string;
            path: string;
        }[];
    };
    release_date: {
        coming_soon: boolean;
        date: string;
    };
    support_info: {
        url: string;
        email: string;
    };
    background: string;
    background_raw: string;
    content_descriptors: {
        ids: number[];
        notes: string;
    };
    ratings?: {
        [key: string]: {
            [key: string]: string;
        }
    }
}