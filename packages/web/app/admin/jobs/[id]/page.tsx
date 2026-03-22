"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
    ArrowLeft,
    Clock,
    User,
    WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {StatusBadge} from "@/components/job-status";
import { Shimmer } from "@/components/shimmer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { browserLog } from "@/lib/browser-logger";
import {cn, formatDurationMs} from "@/lib/utils";
import { JobStatus, JobType } from "@/prisma/generated/browser";
import { JOB_TYPE_LABEL } from "@/types/job";

dayjs.extend(relativeTime);

type LogEntry = { id: string; message: string; level: string; timestamp: string };
type FailedChild = { id: string; appId: number; gameId: string | null; errorMessage: string | null; attempts: number; createdAt: string };
type JobUser = { id: string; username: string; avatarUrl: string | null } | null;

type AdminJobDetail = {
    id: string;
    type: JobType;
    status: JobStatus;
    progress: number;
    processedItems: number;
    totalItems: number;
    failedItems: number;
    allItemsQueued: boolean;
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    claimedBy: string | null;
    user: JobUser;
    logs: LogEntry[];
    logsPagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
    failedPagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
    FailedChildJob: FailedChild[];
};

function logLevelClass(level: string): string {
    switch (level.toLowerCase()) {
        case "error": return "text-red-400";
        case "warn": return "text-amber-400";
        default: return "text-muted-foreground";
    }
}

export default function AdminJobDetailPage() {
    const { id: jobId } = useParams<{ id: string }>();
    const [job, setJob] = useState<AdminJobDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [logPage, setLogPage] = useState(1);
    const [failedPage, setFailedPage] = useState(1);
    const logPageRef = useRef(logPage);
    const esRef = useRef<EventSource | null>(null);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        logPageRef.current = logPage;
    }, [logPage]);

    useEffect(() => {
        if (!jobId) return;

        let cancelled = false;

        void fetch(
            `/api/admin/jobs/${jobId}?logPage=${logPage}&logLimit=25&failedPage=${failedPage}&failedLimit=10`,
        )
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Failed to load job.");
                }
                return response.json();
            })
            .then((data: AdminJobDetail) => {
                if (cancelled) return;
                setJob(data);
                setLoading(false);
            })
            .catch(() => {
                if (!cancelled) {
                    setError("Failed to load job.");
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [jobId, logPage, failedPage]);

    useEffect(() => {
        if (!jobId) return;

        const mergeLogs = (currentLogs: LogEntry[], incomingLogs: LogEntry[]) => {
            const byId = new Map<string, LogEntry>();

            for (const entry of [...incomingLogs, ...currentLogs]) {
                byId.set(entry.id, entry);
            }

            return Array.from(byId.values()).sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
            );
        };

        const es = new EventSource(`/api/admin/jobs/${jobId}/stream`);
        esRef.current = es;

        es.addEventListener("snapshot", (ev: MessageEvent) => {
            try {
                const payload = JSON.parse(ev.data) as Partial<AdminJobDetail> & {
                    logs?: LogEntry[];
                };

                setJob((prev) => {
                    if (!prev) return prev;

                    return {
                        ...prev,
                        ...payload,
                        logs:
                            logPageRef.current === 1
                                ? mergeLogs(prev.logs, payload.logs ?? [])
                                : prev.logs,
                    };
                });

                setIsReconnecting(false);
            } catch {
                browserLog.warn("Failed to parse job snapshot", { rawData: ev.data });
            }
        });

        es.addEventListener("done", () => {
            es.close();
            esRef.current = null;
        });

        es.onerror = () => {
            setIsReconnecting(true);
        };

        es.onopen = () => {
            setIsReconnecting(false);
        };

        return () => {
            es.close();
            esRef.current = null;
        };
    }, [jobId]);

    const runtime = job?.startedAt
        ? formatDurationMs(
            (job.finishedAt ? new Date(job.finishedAt).getTime() : now) -
            new Date(job.startedAt).getTime()
          )
        : null;

    const pct = job
        ? job.totalItems > 0
            ? Math.min(100, Math.round(((job.processedItems + job.failedItems) / job.totalItems) * 100))
            : job.status === JobStatus.COMPLETED ? 100 : 0
        : 0;

    if (loading) {
        return (
            <div className="space-y-4">
                <Shimmer className="h-8 w-48" />
                <Shimmer className="h-64 w-full" />
                <Shimmer className="h-48 w-full" />
            </div>
        );
    }

    if (error && !job) {
        return (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
                <p className="text-red-400">{error}</p>
            </div>
        );
    }

    if (!job) return null;

    return (
        <div className="space-y-6">
            <Link href="/admin/jobs">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-card -ml-2">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Jobs
                </Button>
            </Link>

            <div className="rounded-xl border border-border bg-background p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-foreground">{JOB_TYPE_LABEL[job.type]}</h1>
                        <p className="font-mono text-xs text-muted-foreground/70 mt-1">{job.id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {isReconnecting && (
                            <span className="flex items-center gap-1.5 text-xs text-amber-400">
                                <WifiOff className="h-3.5 w-3.5" />
                                Reconnecting
                            </span>
                        )}
                        <StatusBadge status={job.status} />
                    </div>
                </div>

                <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
                    {runtime && (
                        <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />
                            <span>{job.finishedAt ? `Finished in ${runtime}` : `Running for ${runtime}`}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground/70">Created:</span>
                        <span>{dayjs(job.createdAt).fromNow()}</span>
                    </div>
                    {job.user ? (
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <Avatar className="h-5 w-5">
                                <AvatarImage src={job.user.avatarUrl ?? undefined} />
                                <AvatarFallback className="text-[9px]">{job.user.username[0].toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span>{job.user.username}</span>
                        </div>
                    ) : (
                        <span className="text-muted-foreground/70">System job</span>
                    )}
                </div>

                {job.errorMessage && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                        <p className="text-xs text-red-400 font-mono wrap-break-word">{job.errorMessage}</p>
                    </div>
                )}

                {(job.status === JobStatus.ACTIVE || job.totalItems > 0) && (
                    <div className="space-y-2">
                        <div className="h-2 w-full rounded-full bg-card overflow-hidden">
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
                        <div className="flex justify-between text-xs text-muted-foreground/70">
                            <span>
                                {(job.processedItems + job.failedItems).toLocaleString()} / {job.totalItems.toLocaleString()} items
                                {job.failedItems > 0 && <span className="ml-2 text-amber-400">({job.failedItems.toLocaleString()} failed)</span>}
                            </span>
                            <span>{pct}%</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Logs</h2>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                        <span>{job.logsPagination.total.toLocaleString()} total</span>
                        {logPage > 1 ? (
                            <span className="text-amber-400">Viewing historical page</span>
                        ) : null}
                    </div>
                </div>
                {job.logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground/70 italic">No log entries yet.</p>
                ) : (
                    <div className="overflow-hidden rounded-md border border-border bg-black/30">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border text-muted-foreground/70 uppercase tracking-wide">
                                    <th className="px-3 py-2 text-left">Timestamp</th>
                                    <th className="px-3 py-2 text-left">Level</th>
                                    <th className="px-3 py-2 text-left">Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {job.logs.map((entry) => (
                                    <tr key={entry.id} className="border-b border-border/60 align-top">
                                        <td className="px-3 py-2 font-mono text-muted-foreground/70">
                                            {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                        </td>
                                        <td className={cn("px-3 py-2 font-medium uppercase", logLevelClass(entry.level))}>
                                            {entry.level}
                                        </td>
                                        <td className={cn("px-3 py-2 whitespace-normal wrap-break-word", logLevelClass(entry.level))}>
                                            {entry.message}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {job.logsPagination.pages > 1 ? (
                    <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                        <span>
                            Page {job.logsPagination.page} of {job.logsPagination.pages}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLogPage((currentPage) => Math.max(1, currentPage - 1))}
                                disabled={logPage <= 1}
                                className="h-7 px-2 border border-border text-muted-foreground hover:bg-card disabled:opacity-40"
                            >
                                Previous
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLogPage((currentPage) => Math.min(job.logsPagination.pages, currentPage + 1))}
                                disabled={logPage >= job.logsPagination.pages}
                                className="h-7 px-2 border border-border text-muted-foreground hover:bg-card disabled:opacity-40"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>

            {job.failedPagination.total > 0 && (
                <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Failed Items ({job.failedPagination.total})
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-muted-foreground/70 text-xs uppercase">
                                    <th className="px-3 py-2 text-left">App ID</th>
                                    <th className="px-3 py-2 text-left">Game ID</th>
                                    <th className="px-3 py-2 text-left">Error</th>
                                    <th className="px-3 py-2 text-left">Attempts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {job.FailedChildJob.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground/70">
                                            No failed items on this page.
                                        </td>
                                    </tr>
                                ) : (
                                    job.FailedChildJob.map((f) => (
                                        <tr key={f.id} className="border-b border-border/60 hover:bg-card/20">
                                            <td className="px-3 py-2 font-mono text-xs text-foreground">{f.appId}</td>
                                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground/70">{f.gameId ? `${f.gameId.slice(0, 8)}…` : "—"}</td>
                                            <td className="px-3 py-2 text-xs text-red-400 max-w-xs truncate">{f.errorMessage ?? "—"}</td>
                                            <td className="px-3 py-2 text-xs text-muted-foreground">{f.attempts}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {job.failedPagination.pages > 1 ? (
                        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                            <span>
                                Page {job.failedPagination.page} of {job.failedPagination.pages}
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFailedPage((currentPage) => Math.max(1, currentPage - 1))}
                                    disabled={failedPage <= 1}
                                    className="h-7 px-2 border border-border text-muted-foreground hover:bg-card disabled:opacity-40"
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFailedPage((currentPage) => Math.min(job.failedPagination.pages, currentPage + 1))}
                                    disabled={failedPage >= job.failedPagination.pages}
                                    className="h-7 px-2 border border-border text-muted-foreground hover:bg-card disabled:opacity-40"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
