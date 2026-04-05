import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Settings",
    description: "Manage your account settings, privacy preferences, and linked Steam profile.",
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
    return children;
}

