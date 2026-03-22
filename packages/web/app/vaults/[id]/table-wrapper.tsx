import { useAction } from "next-safe-action/hooks";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";

import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import { KeyVaultAuthType } from "@/prisma/generated/browser";
import { unredeemKey as unredeemKeyAction } from "@/server/actions/vault-keys";
import { getGameCategories, getGameGenres } from "@/server/queries/games";
import { getKeys } from "@/server/queries/vault-keys";

import { KeyDialog, useKeyDialog } from "./key-dialog";
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

    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [sortBy, setSortBy] = useState("game_name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [filters, setFilters] = useState({ name: "", tags: [] as string[], isOwned: null as boolean | null });
    const [debouncedName, setDebouncedName] = useState("");
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
            }})
    );

    const { data: genresResult } = useServerQuery(
        user ? ["genres"] : null,
        () => getGameGenres()
    );
    const { data: categoriesResult } = useServerQuery(
        user ? ["categories"] : null,
        () => getGameCategories()
    );

    useEffect(() => {
        if (onRevalidating) onRevalidating(isRevalidating);
    }, [isRevalidating, onRevalidating]);

    const keysData = keysResult?.success ? keysResult.data : null;
    const data: VaultGameRow[] = (keysData?.games ?? []).map((g) => ({ ...g, isOwned: false }));
    const genres = genresResult?.success ? genresResult.data : [];
    const categories = categoriesResult?.success ? categoriesResult.data : [];

    const unredeemAction = useAction(unredeemKeyAction, { onSuccess: () => mutateKeys() });

    const keyDialogHook = useKeyDialog({
        keyVaultAuthType,
        onMutate: () => mutateKeys(),
    });

    const handleNameChange = useCallback((name: string) => {
        setFilters((prev) => ({ ...prev, name }));
        setPage(1);
        if (searchDebounce.current) clearTimeout(searchDebounce.current);
        searchDebounce.current = setTimeout(() => setDebouncedName(name), 500);
    }, []);

    const columns = useMemo(
        () => createVaultKeyColumns({
            canRedeem,
            openKeyDialog: keyDialogHook.openKeyDialog,
            onUnredeem: (vaultGameId) => unredeemAction.execute({ vaultGameId }),
        }),
        [canRedeem, keyDialogHook.openKeyDialog, unredeemAction]
    );

    return (
        <>
            <div className="space-y-4">
                <VaultFilterToolbar
                    filters={filters}
                    genres={genres}
                    categories={categories}
                    onNameChange={handleNameChange}
                    onTagsChange={(tags) => { setFilters((prev) => ({ ...prev, tags })); setPage(1); }}
                    onOwnedChange={(isOwned) => { setFilters((prev) => ({ ...prev, isOwned })); setPage(1); }}
                    onClearFilters={() => { setFilters({ name: "", tags: [], isOwned: null }); setDebouncedName(""); }}
                    onRefresh={() => mutateKeys()}
                    isLoading={isRevalidating}
                    keyVaultId={keyVaultId}
                    canCreate={canCreate}
                    keyVaultAuthType={keyVaultAuthType}
                    onImportRefresh={() => mutateKeys()}
                />

                <DataTable
                    columns={columns}
                    data={data}
                    totalCount={keysData?.total ?? 0}
                    currentPage={page}
                    pageSize={pageSize}
                    totalPages={keysData?.pages ?? 0}
                    onPageChange={setPage}
                    onSortChange={(newSortBy, newSortOrder) => { setSortBy(newSortBy); setSortOrder(newSortOrder); setPage(1); }}
                    isLoading={isInitialLoading || keysResult === undefined}
                />
            </div>

            <KeyDialog {...keyDialogHook} />
        </>
    );
}

