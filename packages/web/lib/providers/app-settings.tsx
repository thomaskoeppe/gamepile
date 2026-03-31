"use client";

import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
} from "react";

import type { PublicAppSettings } from "@/lib/app-settings";
import { browserLog } from "@/lib/browser-logger";
import { AppSettingKey } from "@/prisma/generated/enums";

interface AppSettingsContextType {
    /** Full snapshot of all public settings. */
    settings: PublicAppSettings;
    /** Typed getter — equivalent to `settings[key]` but type-safe. */
    getSetting: <K extends keyof PublicAppSettings>(key: K) => PublicAppSettings[K];
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

interface AppSettingsProviderProps {
    /** Pre-resolved settings from the Server Component root layout. */
    initialSettings: PublicAppSettings;
    children: ReactNode;
}

/**
 * Provides public app settings to the React tree.
 *
 * Settings are loaded once server-side (no loading state, no waterfall) and
 * passed via `initialSettings`.  Because admin changes are infrequent the
 * value is intentionally static for the lifetime of the page — a full
 * navigation will pick up fresh settings from the root layout.
 *
 * If you need runtime revalidation (e.g. after an admin mutation), call
 * `router.refresh()` from the relevant Server Action result handler; this
 * causes Next.js to re-run the root layout Server Component and push new
 * settings down through this provider automatically.
 */
export function AppSettingsProvider({ initialSettings, children }: AppSettingsProviderProps) {
    browserLog.debug("AppSettingsProvider mounted", {
        keys: Object.keys(initialSettings),
    });

    const getSetting = useCallback(
        <K extends keyof PublicAppSettings>(key: K): PublicAppSettings[K] => {
            return initialSettings[key];
        },
        [initialSettings],
    );

    return (
        <AppSettingsContext.Provider value={{ settings: initialSettings, getSetting }}>
            {children}
        </AppSettingsContext.Provider>
    );
}

/**
 * Returns the app settings context.
 *
 * @throws if called outside of `<AppSettingsProvider>`.
 *
 * @example
 * ```tsx
 * const { getSetting } = useAppSettings();
 * const maxVaults = getSetting(AppSettingKey.MAX_VAULTS_PER_USER);
 * ```
 */
export function useAppSettings(): AppSettingsContextType {
    const ctx = useContext(AppSettingsContext);
    if (!ctx) {
        throw new Error("useAppSettings must be used within an <AppSettingsProvider>");
    }
    return ctx;
}

export { AppSettingKey };


