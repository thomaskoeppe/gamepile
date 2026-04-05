"use client";

import {
    ExternalLink,
    LoaderCircle,
    ShieldCheck,
    Trash2,
    UserRound,
} from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { browserLog } from "@/lib/browser-logger";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import { cn } from "@/lib/utils";
import { deleteAccount,updatePrivacySettings } from "@/server/actions/user-settings";
import { getUserSettings } from "@/server/queries/user-settings";

function PrivacySelectField({
    label,
    description,
    value,
    onValueChange,
}: {
    label: string;
    description: string;
    value: "allow" | "deny";
    onValueChange: (value: "allow" | "deny") => void;
}) {
    return (
        <div className="grid gap-3 rounded-lg border border-border/60 bg-background/40 p-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
            <div className="space-y-1">
                <p className="font-medium text-foreground">{label}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as "allow" | "deny")}>
                <SelectTrigger className="w-full bg-background">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="deny">Block</SelectItem>
                </SelectContent>
            </Select>
        </div>
    );
}

function SettingsSkeleton() {
    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <div className="space-y-6">
                <Card className="border-border/70 bg-card/95">
                    <CardHeader className="flex flex-col gap-4 border-b border-border/60 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <Skeleton className="size-14 rounded-full" />
                            <div className="space-y-2">
                                <Skeleton className="h-7 w-48" />
                                <Skeleton className="h-4 w-72" />
                            </div>
                        </div>
                        <Skeleton className="h-9 w-36" />
                    </CardHeader>
                    <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-2">
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="h-5 w-32" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
                <Card className="border-border/70 bg-card/95">
                    <CardHeader>
                        <Skeleton className="h-6 w-40" />
                        <Skeleton className="h-4 w-64" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-4 space-y-2">
                                <Skeleton className="h-5 w-48" />
                                <Skeleton className="h-4 w-72" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
            <Card className="border-border/70 bg-card/95">
                <CardHeader>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-56" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                </CardContent>
            </Card>
        </div>
    );
}

export function AccountSettingsPanels() {
    const { user } = useSession();

    const {
        data: settingsResult,
        isLoading,
        isValidating,
        mutate,
    } = useServerQuery(
        user ? ["user-settings", user.id] : null,
        () => getUserSettings()
    );

    const settings = settingsResult?.success ? settingsResult.data : null;

    const [allowVaultInvites, setAllowVaultInvites] = useState<"allow" | "deny" | null>(null);
    const [allowCollectionInvites, setAllowCollectionInvites] = useState<"allow" | "deny" | null>(null);
    const [allowProfileView, setAllowProfileView] = useState<"allow" | "deny" | null>(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState("");
    const [privacySuccess, setPrivacySuccess] = useState(false);

    const vaultInvites = allowVaultInvites ?? (settings?.privacyAllowVaultInvites ? "allow" : "deny");
    const collectionInvites = allowCollectionInvites ?? (settings?.privacyAllowCollectionInvites ? "allow" : "deny");
    const profileView = allowProfileView ?? (settings?.privacyAllowProfileView ? "allow" : "deny");

    const privacyAction = useAction(updatePrivacySettings, {
        onSuccess: () => {
            browserLog.info('Privacy settings saved', { userId: user?.id });
            setPrivacySuccess(true);
            void mutate();
            setTimeout(() => setPrivacySuccess(false), 3000);
        },
    });

    const deleteAction = useAction(deleteAccount, {
        onSuccess: () => {
            browserLog.info('Account deleted', { userId: user?.id });
            window.location.href = "/";
        },
    });

    if (isLoading || !user) {
        return <SettingsSkeleton />;
    }

    const handlePrivacySave = () => {
        browserLog.info('Privacy settings save clicked', { userId: user?.id, vaultInvites, collectionInvites, profileView });
        privacyAction.execute({
            privacyAllowVaultInvites: vaultInvites === "allow",
            privacyAllowCollectionInvites: collectionInvites === "allow",
            privacyAllowProfileView: profileView === "allow",
        });
    };

    const handleDeleteAccount = () => {
        browserLog.warn('Account deletion initiated', { userId: user?.id });
        deleteAction.execute({ confirmation: deleteConfirmation });
    };

    return (
        <div className={cn(
            "grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] transition-opacity duration-200",
            isValidating && !isLoading && "opacity-80",
        )}>
            <div className="space-y-6">
                <Card className="border-border/70 bg-card/95">
                    <CardHeader className="flex flex-col gap-4 border-b border-border/60 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <Avatar className="size-14 border border-border">
                                <AvatarImage src={user.avatarUrl ?? undefined} alt={user.username} />
                                <AvatarFallback className="bg-primary/15 text-primary">
                                    {user.username.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>

                            <div className="space-y-1">
                                <CardTitle className="text-2xl">Account Settings</CardTitle>
                                <CardDescription>
                                    Manage your Gamepile account privacy and preferences.
                                </CardDescription>
                            </div>
                        </div>

                        <Button asChild variant="outline" className="w-full sm:w-auto">
                            <Link href={user.profileUrl ?? "#"} target="_blank" rel="noreferrer">
                                View Steam Profile
                                <ExternalLink className="size-4" />
                            </Link>
                        </Button>
                    </CardHeader>

                    <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
                        <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                            <p className="text-sm text-muted-foreground">Username</p>
                            <p className="mt-1 font-medium text-foreground">{user.username}</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                            <p className="text-sm text-muted-foreground">Steam ID</p>
                            <p className="mt-1 font-mono text-sm text-foreground">{user.steamId}</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                            <p className="text-sm text-muted-foreground">Access level</p>
                            <p className="mt-1 inline-flex items-center gap-2 font-medium text-foreground">
                                <ShieldCheck className="size-4 text-primary" />
                                {user.role}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/70 bg-card/95">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <UserRound className="size-5 text-primary" />
                            Privacy Settings
                        </CardTitle>
                        <CardDescription>
                            Decide whether other people can add you to collaborative spaces.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {privacySuccess && (
                            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
                                Privacy settings saved successfully.
                            </div>
                        )}

                        {privacyAction.result?.serverError && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                                {privacyAction.result.serverError}
                            </div>
                        )}

                        <PrivacySelectField
                            label="Can be added by others to vaults"
                            description="Control whether other members can share access to key vaults with you."
                            value={vaultInvites}
                            onValueChange={(v) => setAllowVaultInvites(v)}
                        />

                        <PrivacySelectField
                            label="Can be added by others to collections"
                            description="Control whether other members can invite you into collaborative collections."
                            value={collectionInvites}
                            onValueChange={(v) => setAllowCollectionInvites(v)}
                        />

                        <PrivacySelectField
                            label="Profile visibility"
                            description="Control whether other members can view your profile and game library."
                            value={profileView}
                            onValueChange={(v) => setAllowProfileView(v)}
                        />

                        <div className="flex justify-end">
                            <Button onClick={handlePrivacySave} disabled={privacyAction.isPending}>
                                {privacyAction.isPending ? (
                                    <LoaderCircle className="size-4 animate-spin" />
                                ) : null}
                                Save privacy settings
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/70 bg-card/95">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl text-foreground">
                        <Trash2 className="size-5 text-primary" />
                        Delete Account
                    </CardTitle>
                    <CardDescription>
                        Permanently delete your Gamepile account and all associated data.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {deleteAction.result?.serverError && (
                        <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
                            {deleteAction.result.serverError}
                        </div>
                    )}

                    <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">Before you continue</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                            <li>Your synced library will be removed.</li>
                            <li>Owned collections and vaults will be deleted.</li>
                            <li>All active sessions will be revoked.</li>
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="delete-confirmation" className="text-sm font-medium text-foreground">
                            Type <span className="font-mono">DELETE</span> to confirm
                        </label>
                        <Input
                            id="delete-confirmation"
                            placeholder="DELETE"
                            autoComplete="off"
                            value={deleteConfirmation}
                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                        />
                    </div>

                    <Button
                        variant="outline"
                        className="w-full border-primary/40 text-primary hover:bg-primary/10"
                        disabled={deleteAction.isPending || deleteConfirmation.toUpperCase() !== "DELETE"}
                        onClick={handleDeleteAccount}
                    >
                        {deleteAction.isPending ? (
                            <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                            <Trash2 className="size-4" />
                        )}
                        Delete account
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
