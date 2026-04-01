"use client";

import {
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import {useMemo} from "react";

import {createColumns} from "@/components/explorer/columns";
import { TablePagination } from "@/components/table-pagination";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import type {ExplorerGameRow} from "@/types/explorer";

interface DataTableProps {
    data: ExplorerGameRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    onSort: (field: string) => void;
    isLoading?: boolean;
    isRefreshing?: boolean;
}

export function DataTable({
    data,
    total,
    page,
    pageSize,
    totalPages,
    onPageChange,
    onPageSizeChange,
    onSort,
    isLoading
}: DataTableProps) {
    const columns = useMemo(() => createColumns(onSort), [onSort]);

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        manualPagination: true,
        manualSorting: true,
        pageCount: totalPages,
    });

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                                {headerGroup.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        className="text-muted-foreground text-xs font-medium h-10"
                                        style={{width: header.getSize()}}
                                    >
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({length: pageSize}).map((_, i) => (
                                <TableRow key={`explorer-${i}`} className="border-border">
                                    {columns.map((_, j) => (
                                        <TableCell key={j}>
                                            <div className="h-4 w-full animate-pulse rounded bg-muted"/>
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : table.getRowModel().rows.length === 0 ? (
                            <TableRow className="border-border">
                                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                                    No games found matching your filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    className="border-border hover:bg-muted/40 transition-colors"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="py-2.5">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                    {total > 0 ? (
                        <>
                            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
                            {total.toLocaleString()} games
                        </>
                    ) : (
                        "No results"
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Rows</span>
                        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                            <SelectTrigger className="h-8 w-17.5 bg-card/50 border-border text-xs">
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                {[20, 50, 100].map((s) => (
                                    <SelectItem key={s} value={String(s)}>
                                        {s}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <TablePagination page={page} totalPages={totalPages || 1} onPageChange={onPageChange} />
                </div>
            </div>
        </div>
    );
}
