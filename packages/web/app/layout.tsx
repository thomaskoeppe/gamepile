export const dynamic = "force-dynamic";

import "@/app/globals.css";

import {Analytics} from '@vercel/analytics/next';
import type {Metadata} from "next";
import {Outfit, Space_Grotesk, Space_Mono} from "next/font/google";
import {ReactNode} from "react";
import * as React from "react";

import { AnimatedBackground } from "@/components/animated-background";
import { getPublicSettings } from "@/lib/app-settings";
import { AppSettingsProvider } from "@/lib/providers/app-settings";
import {SessionProvider} from "@/lib/providers/session";

const outfit = Outfit({
    variable: "--font-heading",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
    variable: "--font-sans",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
    variable: "--font-mono",
    subsets: ["latin"],
    weight: ["400", "700"],
});

export const metadata: Metadata = {
    title: {
        default: "GAMEPILE",
        template: "%s — GAMEPILE",
    },
    description:
        "Self-hosted Steam library manager. Import your games, build curated collections, and store activation keys in encrypted vaults.",
    authors: [
        { name: "thomaskoeppe", url: "https://github.com/thomaskoeppe" },
    ],
    creator: "thomaskoeppe",
    keywords: [
        "steam",
        "game library",
        "game collection",
        "key vault",
        "self-hosted",
        "game management",
    ],
    icons: {
        icon: [
            { url: "/favicon.ico", sizes: "any" },
            { url: "/logo.svg", type: "image/svg+xml" },
        ],
        apple: { url: "/logo_4x.png" },
    },
    openGraph: {
        type: "website",
        siteName: "GAMEPILE",
        title: "GAMEPILE",
        description:
            "Self-hosted Steam library manager. Import your games, build curated collections, and store activation keys in encrypted vaults.",
        images: [{ url: "/logo_4x.png", width: 512, height: 512, alt: "GAMEPILE logo" }],
    },
    twitter: {
        card: "summary",
        title: "GAMEPILE",
        description:
            "Self-hosted Steam library manager. Import your games, build curated collections, and store activation keys in encrypted vaults.",
        images: ["/logo_4x.png"],
    }
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body
                className={`${outfit.variable} ${spaceGrotesk.variable} ${spaceMono.variable} antialiased`}
            >
                <AppSettingsProvider initialSettings={getPublicSettings()}>
                    <SessionProvider>
                        <div className="min-h-screen bg-linear-to-b from-card via-background to-background text-foreground">
                            <AnimatedBackground />

                            {children}
                        </div>
                        <Analytics />
                    </SessionProvider>
                </AppSettingsProvider>
            </body>
        </html>
    );
}
