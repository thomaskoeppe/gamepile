import type { NextConfig } from "next";

function normalizeAllowedOrigin(value: string | undefined): string | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    try {
        return new URL(trimmed).host;
    } catch {
        return trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    }
}

const webAppHost = normalizeAllowedOrigin(process.env.WEB_APP_URL);
const configuredAllowedOrigins = (process.env.WEB_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(normalizeAllowedOrigin)
    .filter((origin): origin is string => Boolean(origin));

const serverActionAllowedOrigins =
    process.env.NODE_ENV === "production" && configuredAllowedOrigins.length > 0
        ? configuredAllowedOrigins
        : [...new Set([webAppHost, ...configuredAllowedOrigins].filter((origin): origin is string => Boolean(origin)))];

const nextConfig: NextConfig = {
    output: "standalone",
    reactCompiler: true,
    images: {
      remotePatterns: [
          {
                protocol: "https",
                hostname: "steamcdn-a.akamaihd.net",
          },
          {
                protocol: "https",
                hostname: "cdn.cloudflare.steamstatic.com",
          },
          {
              protocol: "https",
              hostname: "cdn.akamai.steamstatic.com",
          },
          {
                protocol: "https",
                hostname: "avatars.steamstatic.com",
          },
          {
                protocol: "https",
                hostname: "shared.akamai.steamstatic.com",
          },
          {
              protocol: "https",
              hostname: "placehold.co"
          }
      ]
    },
    poweredByHeader: false,
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        key: "X-DNS-Prefetch-Control",
                        value: "on",
                    },
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=63072000; includeSubDomains; preload",
                    },
                    {
                        key: "X-Frame-Options",
                        value: "DENY",
                    },
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "X-XSS-Protection",
                        value: "1; mode=block",
                    },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    }
                ]
            }
        ];
    },
    serverExternalPackages: ['pino', 'pino-pretty'],
    crossOrigin: "anonymous",
    logging: false,
    experimental: {
        serverActions: {
            // In production this prefers WEB_ALLOWED_ORIGINS (CSV), while dev keeps WEB_APP_URL fallback.
            allowedOrigins: serverActionAllowedOrigins,
        }
    }
};

export default nextConfig;
