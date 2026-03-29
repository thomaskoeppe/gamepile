"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
    ChevronLeft,
    ChevronRight,
    Eye,
    LoaderCircle,
    RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {InvokeJobDialog} from "@/components/dialogs/invoke-job";
import {getStatusConfig, StatusBadge} from "@/components/job-status";
import { Shimmer } from "@/components/shimmer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { cn } from "@/lib/utils";
import { JobStatus, JobType } from "@/prisma/generated/browser";
import { getAdminJobs } from "@/server/queries/admin";
import { JOB_TYPE_LABEL } from "@/types/job";

dayjs.extend(relativeTime);

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
    if (!startedAt) return "—";
    const start = dayjs(startedAt);
    const end = finishedAt ? dayjs(finishedAt) : dayjs();
    const diff = end.diff(start, "second");
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function calculateETA(startedAt: string, totalItems: number, processedItems: number, failedItems: number): { seconds: number; minutes: number; hours: number; days: number } | null {
    const start = dayjs(startedAt);
    const completedItems = processedItems + failedItems;
    if (completedItems === 0) return null;
    const rate = completedItems / (dayjs().diff(start, "second") + 1);
    const remaining = totalItems - completedItems;
    const etaSeconds = Math.round(remaining / rate);
    return {
        seconds: etaSeconds % 60,
        minutes: Math.floor((etaSeconds / 60) % 60),
        hours: Math.floor((etaSeconds / 3600) % 24),
        days: Math.floor(etaSeconds / 86400),
    };
}

export default function AdminJobsPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [typeFilter, setTypeFilter] = useState<string>("all");

    const { data: result, isLoading, isRevalidating, mutate } = useServerQuery(
        ["admin-jobs", page, statusFilter, typeFilter],
        () => getAdminJobs({
            page,
            limit: 20,
            status: statusFilter !== "all" ? statusFilter : undefined,
            type: typeFilter !== "all" ? typeFilter : undefined,
        }),
        { refreshInterval: 5000 }
    );

    const jobsData = result?.success ? result.data : null;
    const jobs = jobsData?.jobs ?? [];
    const pagination = jobsData?.pagination ?? { page: 1, pages: 1, total: 0, limit: 20 };
    const error = result?.success === false;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Job Management</h1>
                    <p className="text-sm text-muted-foreground mt-1">Monitor and inspect all background jobs</p>
                </div>

                <div className="flex items-center gap-2">
                    <InvokeJobDialog />

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => mutate()}
                        className="border-border text-muted-foreground hover:bg-muted"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="flex gap-3">
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-44 bg-card border-border text-foreground">
                        <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {Object.values(JobStatus).map((s) => (
                            <SelectItem key={s} value={s}>{getStatusConfig(s).label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-56 bg-card border-border text-foreground">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {Object.values(JobType).map((t) => (
                            <SelectItem key={t} value={t}>{JOB_TYPE_LABEL[t]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className={cn(
                "relative rounded-xl border border-border bg-card overflow-hidden transition-opacity duration-200",
                isRevalidating && !isLoading && "opacity-80",
            )}>
                {isRevalidating && !isLoading && (
                    <div className="absolute top-2 right-2 z-10">
                        <div className="flex items-center gap-1.5 rounded-full bg-muted/80 backdrop-blur-sm border border-border px-2.5 py-1 text-xs text-muted-foreground">
                            <LoaderCircle className="size-3 animate-spin" />
                            <span>Updating</span>
                        </div>
                    </div>
                )}
                {isLoading ? (
                    <div className="space-y-px p-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Shimmer key={i} className="h-14 w-full rounded-none first:rounded-t-lg last:rounded-b-lg" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="p-8 text-center text-destructive">Failed to load jobs.</div>
                ) : jobs.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">No jobs found.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wide">
                                <th className="px-4 py-3 text-left">ID</th>
                                <th className="px-4 py-3 text-left">Type</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-left">Progress</th>
                                <th className="px-4 py-3 text-left">User</th>
                                <th className="px-4 py-3 text-left">Created</th>
                                <th className="px-4 py-3 text-left">Duration</th>
                                <th className="px-4 py-3 text-left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.map((job) => {
                                const pct = job.totalItems > 0
                                    ? Math.min(100, Math.round(((job.processedItems + job.failedItems) / job.totalItems) * 100))
                                    : job.status === JobStatus.COMPLETED ? 100 : 0;

                                return (
                                    <tr key={job.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                            {job.id.slice(0, 12)}…
                                        </td>
                                        <td className="px-4 py-3 text-foreground">
                                            {JOB_TYPE_LABEL[job.type]}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={job.status} />
                                        </td>
                                        <td className="px-4 py-3 w-32">
                                            <div className="space-y-1">
                                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                                    <div
                                                        className={cn(
                                                            "h-full rounded-full transition-all duration-500",
                                                            job.status === JobStatus.ACTIVE ? "bg-blue-500" :
                                                            job.status === JobStatus.COMPLETED ? "bg-primary" :
                                                            job.status === JobStatus.FAILED ? "bg-red-500" : "bg-muted-foreground/30"
                                                        )}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-muted-foreground">{pct}%</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {job.user ? (
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarImage src={job.user.avatarUrl ?? undefined} />
                                                        <AvatarFallback className="text-[10px]">{job.user.username[0].toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-foreground text-xs">{job.user.username}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">System</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs">
                                            {dayjs(job.createdAt).fromNow()}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                                            {formatDuration(job.startedAt, job.finishedAt)}
                                            {job.status === JobStatus.ACTIVE && (
                                                <span>
                                                    {" "}- ETA:{" "}
                                                    {(() => {
                                                        const eta = calculateETA(job.startedAt!, job.totalItems, job.processedItems, job.failedItems);
                                                        if (!eta) return "—";
                                                        if (eta.days > 0) return `${eta.days}d ${eta.hours}h`;
                                                        if (eta.hours > 0) return `${eta.hours}h ${eta.minutes}m`;
                                                        if (eta.minutes > 0) return `${eta.minutes}m ${eta.seconds}s`;
                                                        return `${eta.seconds}s`;
                                                    })()}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link href={`/admin/jobs/${job.id}`}>
                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground hover:bg-muted">
                                                    <Eye className="h-3.5 w-3.5" />
                                                </Button>
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {pagination.pages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{pagination.total} total jobs</span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="h-8 px-2 border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span>Page {page} of {pagination.pages}</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                            disabled={page >= pagination.pages}
                            className="h-8 px-2 border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
