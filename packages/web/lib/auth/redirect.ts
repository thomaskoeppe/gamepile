const DEFAULT_POST_AUTH_REDIRECT = "/library";

const ALLOWED_POST_AUTH_PREFIXES = [
    "/",
    "/library",
    "/dashboard",
    "/explore",
    "/collections",
    "/settings",
    "/vaults",
    "/admin",
] as const;

function isAllowedPostAuthPath(pathname: string): boolean {
    return ALLOWED_POST_AUTH_PREFIXES.some((prefix) => {
        if (prefix === "/") {
            return pathname === "/";
        }

        return pathname === prefix || pathname.startsWith(`${prefix}/`);
    });
}

export function sanitizePostAuthRedirect(redirectPath: string | null | undefined): string {
    if (!redirectPath || !redirectPath.startsWith("/")) {
        return DEFAULT_POST_AUTH_REDIRECT;
    }

    if (redirectPath.startsWith("//")) {
        return DEFAULT_POST_AUTH_REDIRECT;
    }

    const url = new URL(redirectPath, "http://gamepile.local");
    if (!isAllowedPostAuthPath(url.pathname)) {
        return DEFAULT_POST_AUTH_REDIRECT;
    }

    return url.search ? `${url.pathname}${url.search}` : url.pathname;
}

