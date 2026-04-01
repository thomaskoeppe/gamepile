"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { use, useState } from "react";

import { TableWrapper } from "@/app/vaults/[id]/table-wrapper";
import { Header } from "@/components/header";
import { LoadingIndicator } from "@/components/shared/loading-indicator";
import { MemberList, type MemberUser } from "@/components/shared/member-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VaultAuthGate } from "@/components/vault/vault-auth-gate";
import { VaultInfoCard } from "@/components/vault/vault-info-card";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import { KeyVaultAuthType } from "@/prisma/generated/browser";
import { checkVaultAccess, getVaultDetail } from "@/server/queries/vaults";

export default function VaultPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, isLoading: sessionLoading } = useSession();
    const [tableRevalidating, setTableRevalidating] = useState<boolean>(false);

    const {
        data: accessResult,
        isLoading: accessLoading,
        mutate: mutateAccess,
    } = useServerQuery(
        user ? ["vault-access", id, user.id] : null,
        () => checkVaultAccess({ vaultId: id })
    );

    const accessStatus = accessResult?.success ? accessResult.data : null;
    const needsAuth = accessStatus && !accessStatus.hasAccess && accessStatus.authType !== KeyVaultAuthType.NONE;

    const {
        data: vaultResult,
        isRevalidating: vaultRevalidating,
        mutate: mutateVault,
    } = useServerQuery(
        user && accessStatus?.hasAccess ? ["vault-detail", id, user.id] : null,
        () => getVaultDetail({ vaultId: id })
    );

    const vault = vaultResult?.success ? vaultResult.data : null;

    if (sessionLoading || accessLoading || !user) {
        return (
            <>
                <Header />
                <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center overflow-hidden">
                    <LoaderCircle className="size-8 animate-spin text-muted-foreground" />
                </div>
            </>
        );
    }

    if (needsAuth && accessStatus) {
        return (
            <>
                <Header />
                <VaultAuthGate
                    vaultId={id}
                    vaultName={accessStatus.vaultName}
                    authType={accessStatus.authType}
                    onSuccess={() => mutateAccess()}
                />
            </>
        );
    }

    if (!accessStatus?.hasAccess) {
        return (
            <>
                <Header />
                <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 overflow-hidden">
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center gap-3 text-center">
                            <TriangleAlert className="h-10 w-10 text-destructive" />
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">Vault not found</h2>
                                <p className="text-sm text-muted-foreground mt-1">
                                    This vault does not exist or you don not have access to it.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </>
        );
    }

    const isOwner = vault ? vault.createdBy.id === user.id : false;
    const { canRedeem, canCreate } = vault
        ? (vault.createdBy.id === user.id
            ? { canRedeem: true, canCreate: true }
            : vault.users.find(u => u.user.id === user.id) ?? { canRedeem: false, canCreate: false })
        : { canRedeem: false, canCreate: false };

    const members: MemberUser[] = [];
    if (vault) {
        members.push({ ...vault.createdBy, isOwner: true });
        for (const member of vault.users) {
            members.push({
                ...member.user,
                isOwner: false,
                canRedeem: member.canRedeem,
                canCreate: member.canCreate,
                addedBy: member.addedBy,
                addedAt: member.addedAt,
                keyVaultUserId: member.keyVaultUserId,
            });
        }
    }

    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6 relative">
                <div className="space-y-8">
                    <div className="flex gap-6">
                        <div className="flex-2">
                            {vault && <VaultInfoCard vault={vault} isOwner={isOwner} onReload={() => mutateVault()} />}
                        </div>

                        <div className="flex-1">
                            <Card className="h-full bg-card border-border shadow-md">
                                <CardHeader>
                                    <CardTitle>Vault Members</CardTitle>
                                </CardHeader>

                                <CardContent>
                                    <MemberList
                                        resourceId={id}
                                        resourceType="vault"
                                        users={members}
                                        isOwner={isOwner}
                                        onMutate={() => mutateVault()}
                                    />
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    {vault && (
                        <TableWrapper
                            keyVaultId={id}
                            canRedeem={canRedeem}
                            canCreate={canCreate}
                            keyVaultAuthType={vault.authType}
                            onRevalidating={setTableRevalidating}
                        />
                    )}
                </div>
            </div>

            <LoadingIndicator show={vaultRevalidating || tableRevalidating} />
        </>
    );
}