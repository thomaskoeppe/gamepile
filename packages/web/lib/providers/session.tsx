"use client";

import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import useSWR from "swr";

import { browserLog } from "@/lib/browser-logger";

interface SessionUser {
    id: string
    steamId: string
    username: string
    avatarUrl?: string
    profileUrl: string | null
    createdAt: string
    role: string
}

interface SessionInfo {
    id: string
    expiresAt: string
    ipAddress: string | null
    userAgent: string | null
    createdAt: string
    lastAccessedAt: string
}

interface SessionState {
    authenticated: boolean
    user: SessionUser | null
    session: SessionInfo | null
    activeSessions: SessionInfo[]
    isLoading: boolean
    error: Error | null
}

interface SessionContextType extends SessionState {
    login: (redirectPath?: string, inviteCode?: string) => void
    logout: () => Promise<void>
    refreshSession: () => Promise<void>
}

const defaultContext: SessionContextType = {
    authenticated: false,
    user: null,
    session: null,
    activeSessions: [],
    isLoading: true,
    error: null,
    login: () => {},
    logout: async () => {},
    refreshSession: async () => {},
};

const SessionContext = createContext<SessionContextType>(defaultContext);

const fetcher = async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
        throw new Error("Failed to fetch session");
    }
    return res.json();
};

export function SessionProvider({ children }: { children: ReactNode }) {
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const { data, error, isLoading, mutate } = useSWR("/api/session", fetcher, {
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        refreshInterval: 60000,
        dedupingInterval: 5000,
    });

    const login = useCallback((redirectPath: string = "/library", inviteCode?: string) => {
        browserLog.info('Login initiated', { redirectPath, hasInviteCode: !!inviteCode });
        const loginUrl = new URL("/api/auth/signin", window.location.origin);
        loginUrl.searchParams.set("redirect", redirectPath);
        if (inviteCode) loginUrl.searchParams.set("invite_code", inviteCode);
        window.location.href = loginUrl.toString();
    }, []);

    const logout = useCallback(async () => {
        browserLog.info('Logout initiated', { userId: data?.user?.id });
        setIsLoggingOut(true);
        try {
            await fetch("/api/auth/signout", {
                method: "POST",
                credentials: "include",
            });

            browserLog.info('Logout succeeded');
            await mutate({ authenticated: false, user: null, session: null, activeSessions: [] }, false);
            window.location.href = "/";
        } catch (err) {
            browserLog.error("Logout failed", err instanceof Error ? err : new Error(String(err)));
            window.location.href = "/api/auth/signout";
        } finally {
            setIsLoggingOut(false);
        }
    }, [mutate, data?.user?.id]);

    const refreshSession = useCallback(async () => {
        browserLog.debug('Session refresh triggered');
        await mutate();
    }, [mutate]);

    const contextValue: SessionContextType = {
        authenticated: data?.authenticated ?? false,
        user: data?.user ?? null,
        session: data?.session ?? null,
        activeSessions: data?.activeSessions ?? [],
        isLoading: isLoading || isLoggingOut,
        error: error ?? null,
        login,
        logout,
        refreshSession,
    };

    return (
        <SessionContext.Provider value={contextValue}>
            {children}
        </SessionContext.Provider>
    );
}

export function useSession() {
    const context = useContext(SessionContext);
    if (context === undefined) {
        throw new Error("useSession must be used within a SessionProvider");
    }
    return context;
}

export function useRequireAuth(redirectTo: string = "/") {
    const { authenticated, isLoading } = useSession();

    useEffect(() => {
        if (!isLoading && !authenticated) {
            window.location.href = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname)}`;
        }
    }, [authenticated, isLoading, redirectTo]);

    return { authenticated, isLoading };
}
