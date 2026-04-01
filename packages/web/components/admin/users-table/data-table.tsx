'use client';

import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { ExternalLink, LoaderCircle } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useCallback, useMemo, useState } from 'react';

import { TablePagination } from '@/components/table-pagination';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useSession } from '@/lib/providers/session';
import { UserRole } from '@/prisma/generated/browser';
import { changeUserRole } from '@/server/actions/admin';
import type { AdminUserListItem } from '@/server/queries/admin';

const PAGE_SIZE = 10;

function getInitials(username: string): string {
    return username
        .split(' ')
        .map((part) => part[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

function formatDate(value: string): string {
    return new Date(value).toLocaleString();
}

function PrivacyBadge({ enabled, label }: { enabled: boolean; label: string }) {
    return (
        <Badge variant={enabled ? 'secondary' : 'outline'}>
            {label}: {enabled ? 'On' : 'Off'}
        </Badge>
    );
}

function RoleCell({ user, onRoleChange }: { user: AdminUserListItem; onRoleChange: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { user: sessionUser } = useSession();

    const { execute, isPending } = useAction(changeUserRole, {
        onSuccess: () => {
            setIsOpen(false);
            onRoleChange();
        },
        onError: () => {
            setError('Failed to update role');
        },
    });

    const handleRoleChange = useCallback(
        (newRole: string) => {
            setError(null);
            execute({
                userId: user.id,
                role: newRole as typeof UserRole.ADMIN | typeof UserRole.USER,
            });
        },
        [execute, user.id]
    );

    return (
        <div className="space-y-1">
            <Select
                value={user.role}
                onValueChange={handleRoleChange}
                disabled={isPending || user.id === sessionUser?.id}
                open={isOpen}
                onOpenChange={setIsOpen}
            >
                <SelectTrigger className="w-28">
                    {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <SelectValue />}
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={UserRole.USER}>User</SelectItem>
                    <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                </SelectContent>
            </Select>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
    );
}

export type UsersTableProps = {
    data: AdminUserListItem[];
    onDataChangeAction?: () => void;
};

export function UsersDataTable({ data, onDataChangeAction }: UsersTableProps) {
    const [page, setPage] = useState(1);
    const columnHelper = createColumnHelper<AdminUserListItem>();

    const columns = useMemo(
        () => [
            columnHelper.accessor('username', {
                header: 'User',
                cell: (info) => {
                    const user = info.row.original;
                    return (
                        <div className="flex items-start gap-3">
                            <Avatar className="size-10 border border-border/60">
                                <AvatarImage src={user.avatarUrl ?? undefined} alt={user.username} />
                                <AvatarFallback>{getInitials(user.username)}</AvatarFallback>
                            </Avatar>
                            <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium text-foreground">{user.username}</p>
                                    <Badge
                                        variant={user.role === UserRole.ADMIN ? 'default' : 'secondary'}
                                        className="text-xs"
                                    >
                                        {user.role}
                                    </Badge>
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
                    );
                },
            }),
            columnHelper.accessor('role', {
                header: 'Role',
                cell: (info) => (
                    <RoleCell user={info.row.original} onRoleChange={() => onDataChangeAction?.()} />
                ),
            }),
            columnHelper.accessor('activeSessionCount', {
                header: 'Access',
                cell: (info) => {
                    const user = info.row.original;
                    return (
                        <div className="space-y-1 text-sm text-muted-foreground">
                            <p>Joined {formatDate(user.createdAt)}</p>
                            <p>Last login {formatDate(user.lastLogin)}</p>
                            <p>{user.activeSessionCount} active session(s)</p>
                        </div>
                    );
                },
            }),
            columnHelper.accessor((row) => row.counts.jobs, {
                id: 'activity',
                header: 'Activity',
                cell: (info) => {
                    const user = info.row.original;
                    return (
                        <div className="space-y-1 text-sm text-muted-foreground">
                            <p>{user.counts.jobs} background job(s)</p>
                            <p>{user.counts.vaultMemberships + user.counts.collectionMemberships} shared membership(s)</p>
                        </div>
                    );
                },
            }),
            columnHelper.accessor((row) => row.counts.vaultsOwned, {
                id: 'resources',
                header: 'Resources',
                cell: (info) => {
                    const user = info.row.original;
                    return (
                        <div className="space-y-1 text-sm text-muted-foreground">
                            <p>{user.counts.vaultsOwned} vault(s) owned</p>
                            <p>{user.counts.collectionsOwned} collection(s) owned</p>
                            <p>{user.counts.vaultMemberships} vault invite(s)</p>
                            <p>{user.counts.collectionMemberships} collection invite(s)</p>
                        </div>
                    );
                },
            }),
            columnHelper.accessor((row) => row.counts.inviteCodesCreated, {
                id: 'inviteCodes',
                header: 'Invite codes',
                cell: (info) => {
                    const user = info.row.original;
                    return (
                        <div className="space-y-1 text-sm text-muted-foreground">
                            <p>{user.counts.inviteCodesCreated} code(s) created</p>
                            <p>{user.counts.inviteCodesUsed} code(s) redeemed</p>
                            {user.inviteCodeUsage ? (
                                <p>
                                    Latest: <span className="font-mono text-foreground">{user.inviteCodeUsage.code}</span>
                                    <br />
                                    <span className="text-xs">{formatDate(user.inviteCodeUsage.usedAt)}</span>
                                </p>
                            ) : (
                                <p>No redemptions recorded.</p>
                            )}
                        </div>
                    );
                },
            }),
            columnHelper.accessor((row) => row.privacy.allowVaultInvites, {
                id: 'privacy',
                header: 'Privacy',
                cell: (info) => {
                    const user = info.row.original;
                    return (
                        <div className="flex flex-wrap gap-2">
                            <PrivacyBadge enabled={user.privacy.allowVaultInvites} label="Vault invites" />
                            <PrivacyBadge enabled={user.privacy.allowCollectionInvites} label="Collection invites" />
                            <PrivacyBadge enabled={user.privacy.allowProfileView} label="Profile visible" />
                        </div>
                    );
                },
            }),
        ],
        [columnHelper, onDataChangeAction]
    );

    const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);

    const table = useReactTable({
        data,
        columns,
        state: {
            pagination: {
                pageIndex: safePage - 1,
                pageSize: PAGE_SIZE,
            },
        },
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id} className="py-3 px-4">
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} className="border-border/50 hover:bg-muted/30 transition-colors">
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="py-4 px-4">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <TablePagination
                page={safePage}
                totalPages={totalPages}
                totalCount={data.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
            />
        </div>
    );
}
