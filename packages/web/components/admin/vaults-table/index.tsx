import { useMemo, useState } from "react";

import { TablePagination } from "@/components/table-pagination";

import type { AdminUserOption, AdminVaultListItem } from "./owner-row";
import { VaultOwnerRow } from "./owner-row";

const PAGE_SIZE = 10;

export function AdminVaultsTable({
  vaults,
  users,
  onMutate,
}: {
  vaults: AdminVaultListItem[];
  users: AdminUserOption[];
  onMutate?: () => void;
}) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(vaults.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedVaults = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return vaults.slice(start, start + PAGE_SIZE);
  }, [safePage, vaults]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/95">
        <table className="w-full text-sm">
          <thead className="bg-background/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Vault</th>
              <th className="px-4 py-3">Auth</th>
              <th className="px-4 py-3">Games</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Current owner</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vaults.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  No vaults found.
                </td>
              </tr>
            ) : (
              paginatedVaults.map((vault) => (
                <VaultOwnerRow
                  key={vault.id}
                  vault={vault}
                  users={users}
                  onMutate={onMutate}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <TablePagination
        page={safePage}
        totalPages={totalPages}
        totalCount={vaults.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
