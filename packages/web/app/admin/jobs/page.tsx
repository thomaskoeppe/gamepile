"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
    Eye,
    Gauge,
    RefreshCw,
    Server,
    TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { InvokeJobDialog } from "@/components/dialogs/invoke-job";
import { getStatusConfig, StatusBadge } from "@/components/job-status";
import { LoadingIndicator } from "@/components/shared/loading-indicator";
import { Shimmer } from "@/components/shared/shimmer";
import { TablePagination } from "@/components/table-pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

function formatRate(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) return "-";
    if (value >= 100) return `${value.toFixed(0)}`;
    if (value >= 10) return `${value.toFixed(1)}`;
    return `${value.toFixed(2)}`;
}

type JobsMetrics = {
    onlineWorkers: number;
    apiCallsPerSecond: number;
    apiCallsInFiveMinutes: number;
    appsFetchedPerMinute: number;
    apiCallsPerSecondWindowSeconds?: number;
    apiCallsFiveMinutesWindowSeconds?: number;
    appsFetchedPerMinuteWindowSeconds?: number;
};

export default function AdminJobsPage() {
    const [page, setPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [typeFilter, setTypeFilter] = useState<string>("all");

    const { data: result, isLoading, isRevalidating, isValidating, mutate } = useServerQuery(
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
    const metrics = jobsData?.metrics as JobsMetrics | undefined;
    const apiCallsPerSecondWindowSeconds = metrics?.apiCallsPerSecondWindowSeconds;
    const apiCallsFiveMinutesWindowSeconds = metrics?.apiCallsFiveMinutesWindowSeconds;
    const appsFetchedPerMinuteWindowSeconds = metrics?.appsFetchedPerMinuteWindowSeconds;
    const pagination = jobsData?.pagination ?? { page: 1, pages: 1, total: 0, limit: 20 };
    const error = result?.success === false;

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Background Jobs</h1>
                        <p className="text-sm text-muted-foreground">Monitor and inspect all background tasks</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <InvokeJobDialog />

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => mutate()}
                            disabled={isValidating || isLoading}
                        >
                            {isValidating || isLoading ? (
                                <>
                                    <RefreshCw className="size-4 animate-spin mr-2" />
                                    Refreshing
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="size-4 mr-2" />
                                    Refresh
                                </>
                            )}
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

                <div className="grid gap-3 sm:grid-cols-2">
                    <Card className="border-border bg-card py-0">
                        <CardContent className="flex items-center justify-between gap-3 p-4">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Workers Online</p>
                                <p className="text-xl font-semibold text-foreground">{metrics?.onlineWorkers ?? "-"}</p>
                            </div>
                            <Server className="size-5 text-muted-foreground" />
                        </CardContent>
                    </Card>

                    <Card className="border-border bg-card py-0">
                        <CardContent className="space-y-1 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">Job Completion Throughput</p>
                                <Gauge className="size-5 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-foreground">
                                {formatRate(metrics?.apiCallsPerSecond)} API calls/s
                            </p>
                            <p className="text-sm text-foreground">
                                {formatRate(metrics?.apiCallsInFiveMinutes)} API calls/5m
                            </p>
                            <p className="text-sm text-foreground">
                                {formatRate(metrics?.appsFetchedPerMinute)} apps fetched/min
                            </p>
                            <p className="text-xs text-muted-foreground">
                                based on last {apiCallsPerSecondWindowSeconds ?? "-"}s API-call window, {apiCallsFiveMinutesWindowSeconds ?? "-"}s API-call window, and {appsFetchedPerMinuteWindowSeconds ?? "-"}s app-fetch window
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className={cn(
                    "relative rounded-lg border border-border bg-card overflow-hidden transition-opacity duration-200",
                    isRevalidating && !isLoading && "opacity-80",
                )}>
                    {isLoading ? (
                        <div className="space-y-px p-4">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <Shimmer key={i} className="h-14 w-full rounded-lg" />
                            ))}
                        </div>
                    ) : error ? (
                        <Card className="bg-card border-destructive/50 rounded-none">
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <TriangleAlert className="size-10 text-destructive mb-4" />
                                <p className="text-sm font-medium mb-1">Failed to load jobs</p>
                                <Button variant="outline" size="sm" onClick={() => mutate()} className="mt-4">
                                    <RefreshCw className="size-4 mr-1.5" />
                                    Retry
                                </Button>
                            </CardContent>
                        </Card>
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
                    <TablePagination
                        page={page}
                        totalPages={pagination.pages}
                        totalCount={pagination.total}
                        pageSize={pagination.limit}
                        onPageChange={setPage}
                    />
                )}

            </div>

            <LoadingIndicator show={isRevalidating} />
        </>
    );
}
