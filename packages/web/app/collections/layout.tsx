import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Collections",
    description: "Create and manage curated game collections. Share lists with friends or keep them private.",
};

export default function CollectionsLayout({ children }: { children: ReactNode }) {
    return children;
}

