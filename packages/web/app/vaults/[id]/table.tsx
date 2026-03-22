// @react-compiler-disable
"use client";

import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    type SortingState,
    useReactTable,
} from "@tanstack/react-table";
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from "lucide-react";
import {useState} from "react";

import {Button} from "@/components/ui/button";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";

interface DataTableProps<TData> {
    columns: ColumnDef<TData>[]
    data: TData[]
    totalCount: number
    currentPage: number
    pageSize: number
    totalPages: number
    onPageChange: (page: number) => void
    onSortChange: (sortBy: string, sortOrder: "asc" | "desc") => void
    isLoading?: boolean
}

export function DataTable<TData>({
                                     columns,
                                     data,
                                     totalCount,
                                     currentPage,
                                     pageSize,
                                     totalPages,
                                     onPageChange,
                                     onSortChange,
                                     isLoading = false,
                                 }: DataTableProps<TData>) {
    const [sorting, setSorting] = useState<SortingState>([]);

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        manualSorting: true,
        manualPagination: true,
        state: {
            sorting,
        },
        onSortingChange: (updater) => {
            const newSorting = typeof updater === "function" ? updater(sorting) : updater;
            setSorting(newSorting);

            if (newSorting.length > 0) {
                const {id, desc} = newSorting[0];
                onSortChange(id, desc ? "desc" : "asc");
            }
        },
    });

    const startRow = (currentPage - 1) * pageSize + 1;
    const endRow = Math.min(currentPage * pageSize, totalCount);

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card shadow-md">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                                {headerGroup.headers.map((header) => {
                                    const canSort = header.column.getCanSort();
                                    const sorted = header.column.getIsSorted();

                                    return (
                                        <TableHead key={header.id} className="text-muted-foreground">
                                            {header.isPlaceholder ? null : (
                                                <div
                                                    className={`flex items-center gap-2 ${canSort ? "cursor-pointer select-none" : ""}`}
                                                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                                                >
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                    {canSort && (
                                                        <span className="text-muted-foreground/50">
                              {sorted === "asc" ? (
                                  <ArrowUp className="h-4 w-4"/>
                              ) : sorted === "desc" ? (
                                  <ArrowDown className="h-4 w-4"/>
                              ) : (
                                  <ArrowUpDown className="h-4 w-4"/>
                              )}
                            </span>
                                                    )}
                                                </div>
                                            )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                    Loading...
                                </TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} className="border-border hover:bg-accent/5">
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell
                                            key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                    No results found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {totalCount > 0 && (
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">
                    Showing <span className="font-medium text-muted-foreground">{startRow}</span> to{" "}
                    <span className="font-medium text-muted-foreground">{endRow}</span> of{" "}
                    <span className="font-medium text-muted-foreground">{totalCount}</span> results
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        className="border-border hover:bg-card hover:border-primary transition-all duration-300 bg-transparent hover:text-foreground"
                        size="icon"
                        onClick={() => onPageChange(1)}
                        disabled={currentPage === 1 || isLoading}
                    >
                        <ChevronsLeft className="h-4 w-4"/>
                    </Button>
                    <Button
                        variant="outline"
                        className="border-border hover:bg-card hover:border-primary transition-all duration-300 bg-transparent hover:text-foreground"
                        size="icon"
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage === 1 || isLoading}
                    >
                        <ChevronLeft className="h-4 w-4"/>
                    </Button>
                    <div className="flex items-center gap-1 text-sm">
                        <span className="text-muted-foreground">Page</span>
                        <span className="font-medium text-muted-foreground">{currentPage}</span>
                        <span className="text-muted-foreground">of</span>
                        <span className="font-medium text-muted-foreground">{totalPages}</span>
                    </div>
                    <Button
                        variant="outline"
                        className="border-border hover:bg-card hover:border-primary transition-all duration-300 bg-transparent hover:text-foreground"
                        size="icon"
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage === totalPages || isLoading}
                    >
                        <ChevronRight className="h-4 w-4"/>
                    </Button>
                    <Button
                        variant="outline"
                        className="border-border hover:bg-card hover:border-primary transition-all duration-300 bg-transparent hover:text-foreground"
                        size="icon"
                        onClick={() => onPageChange(totalPages)}
                        disabled={currentPage === totalPages || isLoading}
                    >
                        <ChevronsRight className="h-4 w-4"/>
                    </Button>
                </div>
            </div>
            )}
        </div>
    );
}
