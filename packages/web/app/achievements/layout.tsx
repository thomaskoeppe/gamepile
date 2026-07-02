import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Achievements",
    description: "Track achievement completion across your Steam library — progress, perfect games, and missing achievements.",
};

export default function AchievementsLayout({ children }: { children: ReactNode }) {
    return children;
}
