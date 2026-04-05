import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Vaults",
    description: "Securely store and manage game activation keys. PIN or password protected, with shared access controls.",
};

export default function VaultsLayout({ children }: { children: ReactNode }) {
    return children;
}

