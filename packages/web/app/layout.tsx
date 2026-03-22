export const dynamic = "force-dynamic";

import "@/app/globals.css";

import {Analytics} from '@vercel/analytics/next';
import type {Metadata} from "next";
import {Outfit, Space_Grotesk, Space_Mono} from "next/font/google";
import {ReactNode} from "react";
import * as React from "react";

import { AnimatedBackground } from "@/components/animated-background";
import { NotificationsProvider } from "@/lib/providers/notifications";
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
    title: "GAMEPILE | Your Game Library"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body
                className={`${outfit.variable} ${spaceGrotesk.variable} ${spaceMono.variable} antialiased`}
            >
                <SessionProvider>
                    <NotificationsProvider>
                        <div className="min-h-screen bg-linear-to-b from-card via-background to-background text-foreground">
                            <AnimatedBackground />

                            {children}
                        </div>
                    </NotificationsProvider>
                    <Analytics />
                </SessionProvider>
            </body>
        </html>
    );
}
