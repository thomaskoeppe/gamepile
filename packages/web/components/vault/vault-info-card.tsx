"use client";

import dayjs from "dayjs";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { ChangeVaultCredentialsDialog } from "@/app/vaults/[id]/change-vault-credentials-dialog";
import { DeleteVaultDialog } from "@/components/dialogs/delete-vault";
import { RenameVaultDialog } from "@/components/dialogs/rename-vault";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { VaultDetailData } from "@/server/queries/vaults";

interface VaultInfoCardProps {
    vault: VaultDetailData;
    isOwner: boolean;
    onReload?: () => void;
}

export function VaultInfoCard({ vault, isOwner, onReload }: VaultInfoCardProps) {
    const router = useRouter();

    return (
        <Card className="h-full bg-card border-border shadow-md">
            <CardHeader>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <CardTitle>{vault.name}</CardTitle>
                        <CardDescription>
                            Use this keyvault to store and manage your steam license keys securely.
                            All keys are encrypted and can be accessed by authorized members only.
                        </CardDescription>
                    </div>

                    {isOwner && (
                        <div className="flex items-center gap-1 shrink-0">
                            {vault.authType !== "NONE" && (
                                <ChangeVaultCredentialsDialog
                                    vaultId={vault.id}
                                    currentAuthType={vault.authType}
                                    onSuccess={onReload}
                                >
                                    <Button variant="ghost" size="icon" className="size-8">
                                        <KeyRound className="size-4" />
                                        <span className="sr-only">Change vault credentials</span>
                                    </Button>
                                </ChangeVaultCredentialsDialog>
                            )}

                            <RenameVaultDialog
                                vaultId={vault.id}
                                currentName={vault.name}
                                onReload={onReload}
                            >
                                <Button variant="ghost" size="icon" className="size-8">
                                    <Pencil className="size-4" />
                                    <span className="sr-only">Rename vault</span>
                                </Button>
                            </RenameVaultDialog>

                            <DeleteVaultDialog
                                vaultId={vault.id}
                                vaultName={vault.name}
                                onDeleted={() => router.push("/vaults")}
                            >
                                <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive">
                                    <Trash2 className="size-4" />
                                    <span className="sr-only">Delete vault</span>
                                </Button>
                            </DeleteVaultDialog>
                        </div>
                    )}
                </div>
            </CardHeader>

            <CardContent className="h-full flex flex-col justify-end">
                <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                    <div className="flex items-center gap-2">
                        <dt className="text-foreground">ID</dt>
                        <dd className="text-muted-foreground">{vault.id}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                        <dt className="text-foreground">Auth Type</dt>
                        <dd className="text-muted-foreground">{vault.authType}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                        <dt className="text-foreground">Created By</dt>
                        <dd className="text-muted-foreground">{vault.createdBy.username}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                        <dt className="text-foreground">Created At</dt>
                        <dd className="text-muted-foreground">{dayjs(vault.createdAt).format("Do MMM YYYY")}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                        <dt className="text-foreground">Total Games</dt>
                        <dd className="text-muted-foreground">
                            {vault.games.length} ({vault.games.filter(g => g.redeemed).length} Redeemed)
                        </dd>
                    </div>
                </dl>
            </CardContent>
        </Card>
    );
}

