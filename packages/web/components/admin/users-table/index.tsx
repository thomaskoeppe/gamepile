'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminUsersData } from "@/server/queries/admin";

import { UsersDataTable } from "./data-table";
import { UsersSummaryCards } from "./summary-cards";

export function AdminUsersTable({
    data,
    onMutate,
}: {
    data: AdminUsersData;
    onMutate?: () => void;
}) {
    return (
        <div className="space-y-6">
            <UsersSummaryCards summary={data.summary} />

            <Card className="border-border/70 bg-card/95">
                <CardHeader>
                    <CardTitle>Users</CardTitle>
                    <CardDescription>
                        Review account status, privacy preferences, ownership counts, and invite code usage at a glance.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <UsersDataTable data={data.users} onDataChangeAction={onMutate} />
                </CardContent>
            </Card>
        </div>
    );
}
