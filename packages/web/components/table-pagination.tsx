"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PaginationProps {
    page: number;
    totalPages: number;
    onPageChange: (nextPage: number) => void;
    totalCount?: number;
    pageSize?: number;
    className?: string;
}

export function TablePagination({
    page,
    totalPages,
    onPageChange,
    totalCount,
    pageSize,
    className,
}: PaginationProps) {
    const safeTotalPages = Math.max(1, totalPages);
    const start = totalCount && pageSize ? (page - 1) * pageSize + 1 : null;
    const end = totalCount && pageSize ? Math.min(page * pageSize, totalCount) : null;

    return (
        <div className={className ?? "flex items-center justify-between text-sm text-muted-foreground"}>
            <span>
                {typeof totalCount === "number" && typeof start === "number" && typeof end === "number"
                    ? `Showing ${start}-${end} of ${totalCount}`
                    : `Page ${page} of ${safeTotalPages}`}
            </span>
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="h-8 px-2 border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                </Button>
                <span>
                    {page} / {safeTotalPages}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
                    disabled={page >= safeTotalPages}
                    className="h-8 px-2 border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                >
                    Next
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

