import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Explore",
    description: "Browse and discover games from the Steam catalog. Filter by tags, categories, platforms, and more.",
};

export default function ExploreLayout({ children }: { children: ReactNode }) {
    return children;
}

