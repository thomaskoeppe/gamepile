"use client";

import { AccountSettingsPanels } from "@/components/account/account-settings-panels";
import { Header } from "@/components/header";

export default function SettingsPage() {
    return (
        <>
            <Header />
            <main className="container-fluid mx-auto px-4 py-6">
                <AccountSettingsPanels />
            </main>
        </>
    );
}
