import { useAction } from "next-safe-action/hooks";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";

import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import { KeyVaultAuthType } from "@/prisma/generated/browser";
import { unredeemKey as unredeemKeyAction } from "@/server/actions/vault-keys";
import { getGameCategories } from "@/server/queries/games";
import { getKeys } from "@/server/queries/vault-keys";

import { KeyDialog } from "./key-dialog";
import { useKeyDialog } from "./key-dialog.hook";
import { MultiKeyDialog } from "./multi-key-dialog";
import { DataTable } from "./table";
import { createVaultKeyColumns, type VaultGameRow } from "./table-columns";
import { VaultFilterToolbar } from "./vault-filter-toolbar";

export function TableWrapper({
    keyVaultId,
    canRedeem,
    canCreate,
    keyVaultAuthType,
    onRevalidating
}: {
    keyVaultId: string;
    canRedeem: boolean;
    canCreate: boolean;
    keyVaultAuthType: KeyVaultAuthType;
    onRevalidating?: (status: boolean) => void;
}) {
    const { user } = useSession();
    type VaultKeySortField = "addedAt" | "originalName" | "redeemedAt" | "game_name";

    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [sortBy, setSortBy] = useState<VaultKeySortField>("game_name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [filters, setFilters] = useState({
        name: "",
        tags: [] as string[],
        isOwned: null as boolean | null,
        isRedeemed: null as boolean | null,
    });
    const [debouncedName, setDebouncedName] = useState("");
    const [selectedVaultGameIds, setSelectedVaultGameIds] = useState<string[]>([]);
    const [isMultiDialogOpen, setIsMultiDialogOpen] = useState(false);
    const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activeFilters = { ...filters, name: debouncedName };

    const {
        data: keysResult,
        isInitialLoading,
        isRevalidating,
        mutate: mutateKeys,
    } = useServerQuery(
        user ? ["vault-keys", keyVaultId, page, pageSize, sortBy, sortOrder, activeFilters] : null,
        () => getKeys({ keyVaultId, page, pageSize, sortBy, sortOrder, filters: {
                name: activeFilters.name || undefined,
                tags: activeFilters.tags,
                isOwned: activeFilters.isOwned ?? undefined,
                isRedeemed: activeFilters.isRedeemed ?? undefined,
            }})
    );

    const { data: categoriesResult } = useServerQuery(
        user ? ["categories"] : null,
        () => getGameCategories()
    );

    useEffect(() => {
        if (onRevalidating) onRevalidating(isRevalidating);
    }, [isRevalidating, onRevalidating]);

    const keysData = keysResult?.success ? keysResult.data : null;
    const data = useMemo<VaultGameRow[]>(() => keysData?.games ?? [], [keysData?.games]);
    const categories = categoriesResult?.success ? categoriesResult.data : [];

    const unredeemAction = useAction(unredeemKeyAction, { onSuccess: () => mutateKeys() });

    const keyDialogHook = useKeyDialog({
        keyVaultAuthType,
        onMutate: () => mutateKeys(),
    });

    const handleNameChange = useCallback((name: string) => {
        setFilters((prev) => ({ ...prev, name }));
        setPage(1);
        setSelectedVaultGameIds([]);
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        searchDebounce.current = setTimeout(() => setDebouncedName(name), 500);
    }, []);

    const columns = useMemo(
        () => createVaultKeyColumns({
            canRedeem,
            openKeyDialog: keyDialogHook.openKeyDialog,
            onUnredeem: (vaultGameId) => unredeemAction.execute({ vaultGameId }),
            selectedVaultGameIds,
            onToggleSelect: (vaultGameId, checked) => {
                setSelectedVaultGameIds((prev) => {
                    if (!checked) {
                        return prev.filter((id) => id !== vaultGameId);
                    }
                    if (prev.includes(vaultGameId)) {
                        return prev;
                    }
                    return [...prev, vaultGameId];
                });
            },
            onToggleSelectPage: (checked) => {
                const selectableIds = data
                    .filter((row) => !row.redeemed)
                    .map((row) => row.id);

                setSelectedVaultGameIds((prev) => {
                    if (!checked) {
                        return prev.filter((id) => !selectableIds.includes(id));
                    }

                    const merged = new Set([...prev, ...selectableIds]);
                    return Array.from(merged);
                });
            },
            allPageRowsSelected: data.length > 0 && data.filter((row) => !row.redeemed).every((row) => selectedVaultGameIds.includes(row.id)),
            somePageRowsSelected: data.some((row) => !row.redeemed && selectedVaultGameIds.includes(row.id)),
        }),
        [canRedeem, data, keyDialogHook.openKeyDialog, selectedVaultGameIds, unredeemAction]
    );

    return (
        <>
            <div className="space-y-4">
                <VaultFilterToolbar
                    filters={filters}
                    categories={categories}
                    onNameChange={handleNameChange}
                    onTagsChange={(tags) => { setFilters((prev) => ({ ...prev, tags })); setPage(1); setSelectedVaultGameIds([]); }}
                    onOwnedChange={(isOwned) => { setFilters((prev) => ({ ...prev, isOwned })); setPage(1); setSelectedVaultGameIds([]); }}
                    onRedeemedChange={(isRedeemed) => { setFilters((prev) => ({ ...prev, isRedeemed })); setPage(1); setSelectedVaultGameIds([]); }}
                    onClearFilters={() => {
                        setFilters({ name: "", tags: [], isOwned: null, isRedeemed: null });
                        setDebouncedName("");
                        setSelectedVaultGameIds([]);
                    }}
                    onRefresh={() => mutateKeys()}
                    isLoading={isRevalidating}
                    keyVaultId={keyVaultId}
                    canCreate={canCreate}
                    keyVaultAuthType={keyVaultAuthType}
                    onImportRefresh={() => mutateKeys()}
                    openMultiKeyRedeemDialog={() => setIsMultiDialogOpen(true)}
                    showMultiKeyRedeemDialogTrigger={canRedeem && selectedVaultGameIds.length > 0}
                />

                <DataTable
                    columns={columns}
                    data={data}
                    totalCount={keysData?.total ?? 0}
                    currentPage={page}
                    pageSize={pageSize}
                    totalPages={keysData?.pages ?? 0}
                    onPageChange={(nextPage) => {
                        setPage(nextPage);
                        setSelectedVaultGameIds([]);
                    }}
                    onSortChange={(newSortBy, newSortOrder) => {
                        setSortBy(newSortBy as VaultKeySortField);
                        setSortOrder(newSortOrder);
                        setPage(1);
                        setSelectedVaultGameIds([]);
                    }}
                    isLoading={isInitialLoading || keysResult === undefined}
                />
            </div>

            <KeyDialog {...keyDialogHook} />
            <MultiKeyDialog
                open={isMultiDialogOpen}
                onOpenChange={setIsMultiDialogOpen}
                keyVaultAuthType={keyVaultAuthType}
                selectedGames={data.filter((row) => selectedVaultGameIds.includes(row.id))}
                onMutate={() => mutateKeys()}
                onClearSelection={() => setSelectedVaultGameIds([])}
            />
        </>
    );
}
