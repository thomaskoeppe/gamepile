"use client";

import { Check, ClipboardCopy, Link2, Plus, Share2, Trash2, UserPlus } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CreateShareDialog } from "@/components/vault/share/create-share-dialog";
import { browserLog } from "@/lib/browser-logger";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { KeyVaultAuthType } from "@/prisma/generated/browser";
import {
    createVaultShareLink,
    deleteVaultShare,
    inviteUserToVaultShare,
    resolveShareRequest,
    revokeVaultShareLink,
    updateVaultShare,
} from "@/server/actions/vault-shares";
import { getShareRequests, getVaultShares, type VaultShareSummary } from "@/server/queries/vault-shares";
import { getInvitableUsers } from "@/server/queries/vault-users";

function initials(username: string): string {
    return username.split(" ").map((n) => n[0]).join("").toUpperCase();
}

function ShareCard({ share, onMutate }: { share: VaultShareSummary; onMutate: () => void }) {
    const [linkUrl, setLinkUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [inviteUserId, setInviteUserId] = useState<string | null>(null);

    const update = useAction(updateVaultShare, { onSuccess: onMutate });
    const remove = useAction(deleteVaultShare, { onSuccess: onMutate });
    const createLink = useAction(createVaultShareLink);
    const revokeLink = useAction(revokeVaultShareLink, { onSuccess: onMutate });
    const invite = useAction(inviteUserToVaultShare, { onSuccess: () => { setInviteUserId(null); onMutate(); } });

    const { data: usersResult } = useServerQuery(["invitable-users", "vault"], () => getInvitableUsers({ resourceType: "vault" }));
    const invitableUsers = usersResult?.success
        ? usersResult.data.filter((u) => !share.recipients.some((r) => r.user?.id === u.id))
        : [];

    const handleGenerateLink = async () => {
        const result = await createLink.executeAsync({ shareId: share.id, maxUses: 1 });
        if (result?.data?.token) {
            setLinkUrl(`${window.location.origin}/vaults/claim/${result.data.token}`);
            onMutate();
        }
    };

    const handleCopy = async () => {
        if (!linkUrl) return;
        await navigator.clipboard.writeText(linkUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Badge variant={share.mode === "DIRECT" ? "default" : "secondary"}>
                            {share.mode === "DIRECT" ? "Direct claim" : "Request"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                            {share.gameCount === 0 ? "All keys" : `${share.gameCount} key(s)`}
                            {share.maxKeys != null ? ` · limit ${share.maxKeys}` : ""}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            Enabled
                            <Switch
                                checked={share.enabled}
                                onCheckedChange={(enabled) => update.execute({ shareId: share.id, enabled })}
                            />
                        </label>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => {
                                browserLog.info("Deleting share", { shareId: share.id });
                                remove.execute({ shareId: share.id });
                            }}
                        >
                            <Trash2 className="size-4" />
                            <span className="sr-only">Delete share</span>
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleGenerateLink} disabled={createLink.isPending}>
                        <Link2 className="size-4" /> Generate link
                    </Button>
                    {linkUrl && (
                        <Button variant="outline" size="sm" onClick={handleCopy}>
                            {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                            {copied ? "Copied" : "Copy link"}
                        </Button>
                    )}
                    {share.links.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                            {share.links.length} active link(s)
                        </span>
                    )}
                </div>

                {share.links.length > 0 && (
                    <ul className="space-y-1">
                        {share.links.map((link) => (
                            <li key={link.id} className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="font-mono truncate">…{link.token.slice(-8)}</span>
                                <span>
                                    {link.usedCount}/{link.maxUses ?? "∞"} used
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="ml-2 h-6 px-2 text-destructive hover:text-destructive"
                                        onClick={() => revokeLink.execute({ linkId: link.id })}
                                    >
                                        Revoke
                                    </Button>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex items-center gap-2">
                    <Select value={inviteUserId ?? undefined} onValueChange={setInviteUserId}>
                        <SelectTrigger className="w-full" disabled={invitableUsers.length === 0}>
                            <SelectValue placeholder={invitableUsers.length > 0 ? "Invite a user…" : "No users available"} />
                        </SelectTrigger>
                        <SelectContent>
                            {invitableUsers.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                    <Avatar className="h-5 w-5">
                                        <AvatarImage src={u.avatarUrl || "/placeholder.svg"} alt={u.username} />
                                        <AvatarFallback className="text-[10px]">{initials(u.username)}</AvatarFallback>
                                    </Avatar>
                                    {u.username}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        disabled={!inviteUserId || invite.isPending}
                        onClick={() => inviteUserId && invite.execute({ shareId: share.id, userId: inviteUserId })}
                    >
                        <UserPlus className="size-4" /> Invite
                    </Button>
                </div>

                {share.recipients.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {share.recipients.map((r) => (
                            <Badge key={r.recipientId} variant="outline">
                                {r.user?.username ?? "Pending link"}
                            </Badge>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function VaultShareManager({ vaultId, authType }: { vaultId: string; authType: KeyVaultAuthType }) {
    const { data: sharesResult, mutate: mutateShares } = useServerQuery(
        ["vault-shares", vaultId],
        () => getVaultShares({ vaultId }),
    );
    const { data: requestsResult, mutate: mutateRequests } = useServerQuery(
        ["vault-share-requests", vaultId],
        () => getShareRequests({ vaultId }),
    );

    const shares = sharesResult?.success ? sharesResult.data : [];
    const requests = requestsResult?.success ? requestsResult.data : [];

    const resolve = useAction(resolveShareRequest, {
        onSuccess: () => { void mutateRequests(); void mutateShares(); },
    });

    const reloadAll = () => { void mutateShares(); void mutateRequests(); };

    return (
        <Card className="bg-card border-border shadow-md">
            <CardHeader>
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <CardTitle>Sharing</CardTitle>
                        <CardDescription>Share keys with others via direct invites or one-time links.</CardDescription>
                    </div>
                    <CreateShareDialog vaultId={vaultId} authType={authType} onCreated={reloadAll}>
                        <Button size="sm"><Plus className="size-4" /> Create share</Button>
                    </CreateShareDialog>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {requests.length > 0 && (
                    <div className="rounded-md border border-border p-3 space-y-2">
                        <p className="text-sm font-medium">Pending requests</p>
                        {requests.map((req) => (
                            <div key={req.requestId} className="flex items-center justify-between gap-2 text-sm">
                                <span className="truncate">
                                    <span className="font-medium">{req.requestedBy.username}</span> wants{" "}
                                    <span className="text-muted-foreground">{req.gameName}</span>
                                </span>
                                <span className="flex gap-2">
                                    <Button size="sm" onClick={() => resolve.execute({ requestId: req.requestId, approve: true })}>
                                        Approve
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => resolve.execute({ requestId: req.requestId, approve: false })}>
                                        Deny
                                    </Button>
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {shares.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
                        <Share2 className="size-8" />
                        <p className="text-sm">No shares yet.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {shares.map((share) => (
                            <ShareCard key={share.id} share={share} onMutate={reloadAll} />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
