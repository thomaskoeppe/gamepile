"use client";

import {
    Circle,
    CircleAlert,
    CircleCheckBig,
    CircleMinus,
    CircleSlash,
    Clock,
    LoaderCircle,
    WifiOff,
} from "lucide-react";
import {ReactNode, useEffect, useMemo, useRef, useState} from "react";

import {ScrollArea} from "@/components/ui/scroll-area";
import { StreamPhase, useJobStream } from "@/lib/hooks/use-job-stream";
import {cn, formatDurationMs} from "@/lib/utils";
import { JobStatus, JobType } from "@/prisma/generated/enums";
import { JOB_TYPE_LABEL, JobSnapshot } from "@/types/job";

function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleTimeString([], {
        hour:   "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

type StatusConfig = {
    label:    string;
    icon:     ReactNode;
    classes:  string;
};

export function getStatusConfig(status: JobStatus): StatusConfig {
    switch (status) {
        case JobStatus.QUEUED:
            return {
                label:   "Queued",
                icon:    <Circle className="h-3.5 w-3.5" />,
                classes: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
            };
        case JobStatus.ACTIVE:
            return {
                label:   "Active",
                icon:    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />,
                classes: "bg-blue-500/15 text-blue-400 border-blue-500/30",
            };
        case JobStatus.COMPLETED:
            return {
                label:   "Completed",
                icon:    <CircleCheckBig className="h-3.5 w-3.5" />,
                classes: "bg-green-500/15 text-green-400 border-green-500/30",
            };
        case JobStatus.PARTIALLY_COMPLETED:
            return {
                label:   "Partial",
                icon:    <CircleAlert className="h-3.5 w-3.5" />,
                classes: "bg-amber-500/15 text-amber-400 border-amber-500/30",
            };
        case JobStatus.FAILED:
            return {
                label:   "Failed",
                icon:    <CircleSlash className="h-3.5 w-3.5" />,
                classes: "bg-red-500/15 text-red-400 border-red-500/30",
            };
        case JobStatus.CANCELED:
            return {
                label:   "Canceled",
                icon:    <CircleMinus className="h-3.5 w-3.5" />,
                classes: "bg-muted text-muted-foreground border-border",
            };
    }
}

export function StatusBadge({ status }: { status: JobStatus }) {
    const cfg = getStatusConfig(status);
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
                "text-xs font-medium",
                cfg.classes,
            )}
        >
      {cfg.icon}
            {cfg.label}
    </span>
    );
}

function logLevelClass(level: string): string {
    switch (level.toLowerCase()) {
        case "error": return "text-red-400";
        case "warn":  return "text-amber-400";
        default:      return "text-muted-foreground";
    }
}

function ProgressSection({ snapshot }: { snapshot: JobSnapshot }) {
    const { processedItems, failedItems, totalItems, allItemsQueued } = snapshot;
    const completedItems = processedItems + failedItems;

    if (!allItemsQueued) {
        return (
            <div className="space-y-1.5">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full w-full bg-primary/40 animate-pulse rounded-full" />
                </div>
                <p className="text-xs text-muted-foreground">
                    Fetching game list… {totalItems > 0 ? `${totalItems.toLocaleString()} queued so far` : ""}
                </p>
            </div>
        );
    }

    const pct = totalItems > 0
        ? Math.min(100, Math.round((completedItems / totalItems) * 100))
        : 100;

    return (
        <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {completedItems.toLocaleString()} / {totalItems.toLocaleString()} items
            {failedItems > 0 && (
                <span className="ml-2 text-amber-400">
              ({failedItems.toLocaleString()} failed)
            </span>
            )}
        </span>
                <span>{pct}%</span>
            </div>
        </div>
    );
}

function LogTail({ snapshot }: { snapshot: JobSnapshot }) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [snapshot.logs]);

    if (snapshot.logs.length === 0) {
        return (
            <p className="text-xs text-muted-foreground italic">No log entries yet.</p>
        );
    }

    return (
        <ScrollArea
            ref={containerRef}
            className="h-36 rounded-md bg-black/30 p-2 font-mono text-[11px] leading-relaxed space-y-0.5"
        >
            {snapshot.logs.map((entry) => (
                <div key={entry.id} className="flex gap-2 min-w-0">
                    <span className="shrink-0 text-muted-foreground/60">
                        {formatTimestamp(entry.timestamp)}
                    </span>

                    <span className={cn("wrap-break-word min-w-0", logLevelClass(entry.level))}>
                        {entry.message}
                    </span>
                </div>
            ))}
        </ScrollArea>
    );
}

function Skeleton({ className }: { className?: string }) {
    return (
        <div className={cn("animate-pulse rounded-md bg-muted", className)} />
    );
}

function JobStatusSkeleton() {
    return (
        <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-1.5 w-full" />
            <div className="space-y-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-5/6" />
            </div>
        </div>
    );
}

function NoJobCard({ jobType }: { jobType: JobType }) {
    return (
        <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">
                No recent {JOB_TYPE_LABEL[jobType].toLowerCase()} found.
            </p>
        </div>
    );
}

function ErrorCard() {
    return (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm text-red-400">Failed to load job status.</p>
        </div>
    );
}

function JobCard({
                     snapshot,
                     phase,
                     isReconnecting,
                 }: {
    snapshot: JobSnapshot;
    phase: StreamPhase;
    isReconnecting: boolean;
}) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (phase !== "streaming") return;
        const id = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(id);
    }, [phase]);

    const runtime = useMemo(() => {
        if (!snapshot.startedAt) return null;
        const start = new Date(snapshot.startedAt).getTime();
        const end   = snapshot.finishedAt
            ? new Date(snapshot.finishedAt).getTime()
            : now;
        return formatDurationMs(end - start);
    }, [snapshot.startedAt, snapshot.finishedAt, now]);

    const isActive = snapshot.status === JobStatus.ACTIVE ||
        snapshot.status === JobStatus.QUEUED;

    return (
        <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-medium text-sm">
                        {JOB_TYPE_LABEL[snapshot.type]}
                    </p>
                    {runtime && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Clock className="h-3 w-3 shrink-0" />
                            {snapshot.finishedAt ? `Finished in ${runtime}` : `Running for ${runtime}`}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {isReconnecting && (
                        <span
                            className="flex items-center gap-1 text-xs text-amber-400"
                            title="Stream disconnected — reconnecting"
                        >
              <WifiOff className="h-3 w-3" />
              Reconnecting
            </span>
                    )}
                    <StatusBadge status={snapshot.status} />
                </div>
            </div>

            {snapshot.errorMessage && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                    <p className="text-xs text-red-400 font-mono wrap-break-word">
                        {snapshot.errorMessage}
                    </p>
                </div>
            )}

            {(isActive || snapshot.totalItems > 0) && (
                <ProgressSection snapshot={snapshot} />
            )}

            <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Logs
                </p>
                <LogTail snapshot={snapshot} />
            </div>
        </div>
    );
}

export function JobStatusCard({ jobType }: { jobType: JobType }) {
    const { snapshot, phase, isReconnecting } = useJobStream(jobType);

    if (phase === "loading")              return <JobStatusSkeleton />;
    if (phase === "no-job")              return <NoJobCard jobType={jobType} />;
    if (phase === "error" && !snapshot)  return <ErrorCard />;
    if (!snapshot)                       return null;

    return (
        <JobCard
            snapshot={snapshot}
            phase={phase}
            isReconnecting={isReconnecting}
        />
    );
}