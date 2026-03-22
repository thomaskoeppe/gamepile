import { ExternalLink } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import type { AdminUsersData } from "@/server/queries/admin";

function getInitials(username: string): string {
    return username
        .split(" ")
        .map((part) => part[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function formatDate(value: string): string {
    return new Date(value).toLocaleString();
}

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

function PrivacyBadge({ enabled, label }: { enabled: boolean; label: string }) {
    return (
        <Badge variant={enabled ? "secondary" : "outline"}>
            {label}: {enabled ? "On" : "Off"}
        </Badge>
    );
}

export function AdminUsersTable({ data }: { data: AdminUsersData }) {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                <SummaryCard
                    title="Total users"
                    value={data.summary.totalUsers}
                    description="All Steam accounts that have signed in to Gamepile."
                />
                <SummaryCard
                    title="Admins"
                    value={data.summary.adminUsers}
                    description="Users with elevated access to platform administration."
                />
                <SummaryCard
                    title="Vault invites enabled"
                    value={data.summary.usersAllowingVaultInvites}
                    description="Users who currently allow vault invitations."
                />
                <SummaryCard
                    title="Collection invites enabled"
                    value={data.summary.usersAllowingCollectionInvites}
                    description="Users who currently allow collection invitations."
                />
            </div>

            <Card className="border-border/70 bg-card/95">
                <CardHeader>
                    <CardTitle>Users</CardTitle>
                    <CardDescription>
                        Review account status, privacy preferences, ownership counts, and invite code usage at a glance.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Access</TableHead>
                                <TableHead>Activity</TableHead>
                                <TableHead>Resources</TableHead>
                                <TableHead>Invite codes</TableHead>
                                <TableHead>Privacy</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                        No users found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                data.users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="align-top">
                                            <div className="flex items-start gap-3">
                                                <Avatar className="size-10 border border-border/60">
                                                    <AvatarImage src={user.avatarUrl ?? undefined} alt={user.username} />
                                                    <AvatarFallback>{getInitials(user.username)}</AvatarFallback>
                                                </Avatar>
                                                <div className="space-y-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-medium text-foreground">{user.username}</p>
                                                        <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
                                                    </div>
                                                    <p className="font-mono text-xs text-muted-foreground">{user.steamId}</p>
                                                    <a
                                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                                        href={user.profileUrl}
                                                        rel="noreferrer"
                                                        target="_blank"
                                                    >
                                                        Steam profile
                                                        <ExternalLink className="size-3" />
                                                    </a>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="space-y-1 text-sm text-muted-foreground">
                                                <p>Joined {formatDate(user.createdAt)}</p>
                                                <p>Last login {formatDate(user.lastLogin)}</p>
                                                <p>{user.activeSessionCount} active session(s)</p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="space-y-1 text-sm text-muted-foreground">
                                                <p>{user.counts.jobs} background job(s)</p>
                                                <p>{user.counts.vaultMemberships + user.counts.collectionMemberships} shared membership(s)</p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="space-y-1 text-sm text-muted-foreground">
                                                <p>{user.counts.vaultsOwned} vault(s) owned</p>
                                                <p>{user.counts.collectionsOwned} collection(s) owned</p>
                                                <p>{user.counts.vaultMemberships} vault invite(s)</p>
                                                <p>{user.counts.collectionMemberships} collection invite(s)</p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="space-y-1 text-sm text-muted-foreground">
                                                <p>{user.counts.inviteCodesCreated} code(s) created</p>
                                                <p>{user.counts.inviteCodesUsed} code(s) redeemed</p>
                                                {user.inviteCodeUsage ? (
                                                    <p>
                                                        Latest redemption: <span className="font-mono text-foreground">{user.inviteCodeUsage.code}</span>
                                                        <br />
                                                        <span className="text-xs">{formatDate(user.inviteCodeUsage.usedAt)}</span>
                                                    </p>
                                                ) : (
                                                    <p>No invite code redemptions recorded.</p>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="flex flex-wrap gap-2">
                                                <PrivacyBadge enabled={user.privacy.allowVaultInvites} label="Vault invites" />
                                                <PrivacyBadge enabled={user.privacy.allowCollectionInvites} label="Collection invites" />
                                                <PrivacyBadge enabled={user.privacy.allowProfileView} label="Profile visible" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

