import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Library",
    description: "Your personal Steam game library. View owned games, playtime, and achievements.",
};

export default function LibraryLayout({ children }: { children: ReactNode }) {
    return children;
}

