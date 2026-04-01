'use client';

import { useMemo, useState } from "react";

import { TablePagination } from "@/components/table-pagination";

import type { AdminCollectionListItem, AdminUserOption } from "./owner-row";
import { CollectionOwnerRow } from "./owner-row";

const PAGE_SIZE = 10;

export function AdminCollectionsTable({
  collections,
  users,
  onMutate,
}: {
  collections: AdminCollectionListItem[];
  users: AdminUserOption[];
  onMutate?: () => void;
}) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(collections.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedCollections = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return collections.slice(start, start + PAGE_SIZE);
  }, [collections, safePage]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/95">
        <table className="w-full text-sm">
          <thead className="bg-background/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Collection</th>
              <th className="px-4 py-3">Visibility</th>
              <th className="px-4 py-3">Games</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Current owner</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {collections.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  No collections found.
                </td>
              </tr>
            ) : (
              paginatedCollections.map((collection) => (
                <CollectionOwnerRow
                  key={collection.id}
                  collection={collection}
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
        totalCount={collections.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
