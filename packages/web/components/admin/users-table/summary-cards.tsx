import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminUsersData } from "@/server/queries/admin";

function SummaryCard({ title, value, description }: { title: string; value: number; description: string }) {
  return (
    <Card className="border-border/70 bg-card/95">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function UsersSummaryCards({ summary }: { summary: AdminUsersData["summary"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <SummaryCard
        title="Total users"
        value={summary.totalUsers}
        description="All Steam accounts that have signed in to Gamepile."
      />
      <SummaryCard
        title="Admins"
        value={summary.adminUsers}
        description="Users with elevated access to platform administration."
      />
      <SummaryCard
        title="Vault invites enabled"
        value={summary.usersAllowingVaultInvites}
        description="Users who currently allow vault invitations."
      />
      <SummaryCard
        title="Collection invites enabled"
        value={summary.usersAllowingCollectionInvites}
        description="Users who currently allow collection invitations."
      />
    </div>
  );
}

