import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { Header } from "@/components/header";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: {
        default: "Admin",
        template: "%s — Admin — GAMEPILE",
    },
    description: "Administration panel for managing users, jobs, configuration, and platform settings.",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const sessionData = await getCurrentSession();

    if (!sessionData || sessionData.user.role !== "ADMIN") {
        redirect("/library");
    }

    return (
        <div className="min-h-screen bg-background">
            <Header />
            <div className="container-fluid mx-auto px-4 py-8">
                <div className="mb-6">
                    <AdminNav />
                </div>
                {children}
            </div>
        </div>
    );
}
