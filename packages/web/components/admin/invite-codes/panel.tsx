'use client';

import { useMemo, useState } from "react";

import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminInviteCodesData } from "@/server/queries/invite-codes";

import { InviteCodeCreateForm } from "./create-form";
import { DeleteInviteCodeButton } from "./delete-button";

const PAGE_SIZE = 10;

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString();
}

function SummaryCard({ title, value, description }: { title: string; value: string | number; description: string }) {
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

export function AdminInviteCodesPanel({
  data,
  onMutate,
}: {
  data: AdminInviteCodesData;
  onMutate?: () => void;
}) {
  const [page, setPage] = useState(1);
  const sortedCodes = useMemo(() => data.codes, [data.codes]);

  const totalPages = Math.max(1, Math.ceil(sortedCodes.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedCodes = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sortedCodes.slice(start, start + PAGE_SIZE);
  }, [safePage, sortedCodes]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Total codes"
          value={data.summary.totalCodes}
          description="Invite codes that exist in the system, including expired and exhausted codes."
        />
        <SummaryCard
          title="Usable codes"
          value={data.summary.activeCodes}
          description="Codes that are not expired and still have remaining uses."
        />
        <SummaryCard
          title="Total redemptions"
          value={data.summary.totalUsages}
          description="How many user signups were completed through invite codes."
        />
      </div>

      <InviteCodeCreateForm generationEnabled={data.generationEnabled} onCreated={onMutate} />

      <Card className="border-border/70 bg-card/95">
        <CardHeader>
          <CardTitle>Existing invite codes</CardTitle>
          <CardDescription>
            Review creation metadata, remaining capacity, and the users who redeemed each code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Redeemed by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCodes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No invite codes have been generated yet.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCodes.map((inviteCode) => (
                  <TableRow key={inviteCode.id}>
                    <TableCell className="align-top">
                      <div className="space-y-2">
                        <p className="font-mono text-sm tracking-[0.2em] text-foreground">{inviteCode.code}</p>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>Created by {inviteCode.createdBy.username}</p>
                          <p>{inviteCode.createdBy.steamId}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={inviteCode.isAvailable ? "default" : "secondary"}>
                          {inviteCode.isAvailable ? "Usable" : "Unavailable"}
                        </Badge>
                        {inviteCode.isExpired ? <Badge variant="destructive">Expired</Badge> : null}
                        {inviteCode.remainingUses === 0 ? <Badge variant="secondary">Exhausted</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>{formatDateTime(inviteCode.createdAt)}</p>
                        <p>Expires: {formatDateTime(inviteCode.expiresAt)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>
                          {inviteCode.usageCount}
                          {inviteCode.maxUses == null ? " / unlimited" : ` / ${inviteCode.maxUses}`}
                        </p>
                        <p>
                          Remaining: {inviteCode.remainingUses == null ? "Unlimited" : inviteCode.remainingUses}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      {inviteCode.usage.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No one has redeemed this code yet.</p>
                      ) : (
                        <ScrollArea className="h-28 pr-3">
                          <div className="space-y-3">
                            {inviteCode.usage.map((usage) => (
                              <div key={usage.id} className="space-y-1 text-sm">
                                <p className="font-medium text-foreground">{usage.usedBy.username}</p>
                                <p className="font-mono text-xs text-muted-foreground">{usage.usedBy.steamId}</p>
                                <p className="text-xs text-muted-foreground">Redeemed {formatDateTime(usage.usedAt)}</p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <DeleteInviteCodeButton
                        inviteCodeId={inviteCode.id}
                        code={inviteCode.code}
                        onDeletedAction={onMutate}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <TablePagination
            page={safePage}
            totalPages={totalPages}
            totalCount={sortedCodes.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
