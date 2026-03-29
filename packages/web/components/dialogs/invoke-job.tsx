"use client";

import {
    CheckCircle2,
    ChevronRight,
    Gamepad2,
    Library,
    LoaderCircle,
    Play,
    RefreshCw,
    ShieldAlert,
    Users,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type ReactElement, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { cn } from "@/lib/utils";
import { JobType } from "@/prisma/generated/enums";
import { invokeAdminJob } from "@/server/actions/admin";
import { getAllUsers } from "@/server/queries/admin";

type JobConfig = {
    label: string;
    description: string;
    details: string;
    requiresUser: boolean;
    icon: ReactElement;
    color: string;
};

const JOB_CONFIGS: Record<string, JobConfig> = {
    [JobType.SYNC_STEAM_GAMES]: {
        label: "Sync Steam Catalog",
        description: "Synchronise the full Steam games catalog with the local database.",
        details:
            "Fetches the complete list of apps from Steam and queues detail-fetch jobs for every new or updated entry. Runs incrementally after the first sync.",
        requiresUser: false,
        icon: <RefreshCw className="h-5 w-5" />,
        color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    },
    [JobType.IMPORT_USER_LIBRARY]: {
        label: "Import User Library",
        description: "Import a specific user's Steam game library and playtime data.",
        details:
            "Fetches the user's owned games from the Steam API and queues detail jobs for any games that are missing or stale.",
        requiresUser: true,
        icon: <Users className="h-5 w-5" />,
        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    },
    [JobType.REFRESH_GAME_DETAILS]: {
        label: "Refresh Game Details",
        description: "Re-fetch metadata from the Steam store for all stale user-owned games.",
        details:
            "Finds every game linked to a user library whose details haven't been refreshed within the configured staleness window and re-queues them.",
        requiresUser: false,
        icon: <Gamepad2 className="h-5 w-5" />,
        color: "text-violet-400 bg-violet-500/10 border-violet-500/30",
    },
};

const INVOKABLE_TYPES = [
    JobType.SYNC_STEAM_GAMES,
    JobType.IMPORT_USER_LIBRARY,
    JobType.REFRESH_GAME_DETAILS,
] as const;

type Step = 1 | 2 | 3;

export function InvokeJobDialog() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<Step>(1);
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string>("");
    const [result, setResult] = useState<{ jobId?: string; message?: string } | null>(null);

    const { data: usersResult, isLoading: usersLoading } = useServerQuery(
        open ? ["admin-all-users-invoke"] : null,
        () => getAllUsers(),
    );
    const users = usersResult?.success ? usersResult.data : [];

    const { execute, isPending } = useAction(invokeAdminJob, {
        onSuccess: ({ data }) => {
            setResult({ jobId: data?.jobId, message: data?.message });
            setStep(3);
        },
        onError: ({ error }) => {
            setResult({ message: error.serverError ?? "An unexpected error occurred." });
            setStep(3);
        },
    });

    const config = selectedType ? JOB_CONFIGS[selectedType] : null;
    const isSuccess = step === 3 && result?.jobId;

    const reset = useCallback(() => {
        setStep(1);
        setSelectedType(null);
        setSelectedUserId("");
        setResult(null);
    }, []);

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next);
        if (!next) setTimeout(reset, 300);
    }, [reset]);

    const handleStep1Continue = useCallback(() => {
        if (!selectedType) return;
        setStep(2);
    }, [selectedType]);

    const handleSubmit = useCallback(() => {
        if (!selectedType) return;
        execute({
            type: selectedType as (typeof INVOKABLE_TYPES)[number],
            userId: config?.requiresUser ? selectedUserId || undefined : undefined,
        });
    }, [selectedType, config, selectedUserId, execute]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Play className="h-3.5 w-3.5" />
                    Run Job
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg outline-none">
                <DialogHeader>
                    <DialogTitle>Run Background Job</DialogTitle>
                    <DialogDescription>
                        {step === 1 && "Select the job type you want to queue."}
                        {step === 2 && (config?.requiresUser
                            ? "Choose a target user for this job."
                            : "Review and confirm the job you want to run.")}
                        {step === 3 && (isSuccess ? "Job queued successfully." : "Failed to queue job.")}
                    </DialogDescription>
                </DialogHeader>

                {step !== 3 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {["Select type", "Configure"].map((label, i) => {
                            const s = (i + 1) as Step;
                            const active = step === s;
                            const done = step > s;
                            return (
                                <div key={label} className="flex items-center gap-1.5">
                                    <div className={cn(
                                        "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                                        done && "bg-primary text-primary-foreground",
                                        active && "border border-primary bg-primary/15 text-primary",
                                        !done && !active && "bg-muted text-muted-foreground",
                                    )}>
                                        {done ? <CheckCircle2 className="h-3 w-3" /> : s}
                                    </div>
                                    <span className={active ? "text-foreground font-medium" : ""}>{label}</span>
                                    {i < 1 && <ChevronRight className="h-3 w-3 opacity-40" />}
                                </div>
                            );
                        })}
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-4">
                        <div className="grid gap-2">
                            {INVOKABLE_TYPES.map((type) => {
                                const cfg = JOB_CONFIGS[type];
                                const selected = selectedType === type;
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setSelectedType(type)}
                                        className={cn(
                                            "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-150",
                                            selected
                                                ? "border-primary/50 bg-primary/5"
                                                : "border-border/60 bg-background/40 hover:border-border hover:bg-muted/30",
                                        )}
                                    >
                                        <div className={cn(
                                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                                            cfg.color,
                                        )}>
                                            {cfg.icon}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground">{cfg.label}</p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{cfg.description}</p>
                                        </div>
                                        {selected && (
                                            <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-primary" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleStep1Continue} disabled={!selectedType}>
                                Continue <ChevronRight className="h-4 w-4" />
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 2 && config && (
                    <div className="space-y-4">
                        {/* Selected job summary */}
                        <div className={cn(
                            "flex items-start gap-3 rounded-xl border p-3.5",
                            config.color,
                        )}>
                            <div className="mt-0.5 shrink-0">{config.icon}</div>
                            <div>
                                <p className="text-sm font-semibold">{config.label}</p>
                                <p className="mt-0.5 text-xs opacity-80">{config.details}</p>
                            </div>
                        </div>

                        {/* User selector — only for user-specific jobs */}
                        {config.requiresUser && (
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                    <Library className="h-3.5 w-3.5 text-muted-foreground" />
                                    Target User
                                </label>
                                <Select
                                    value={selectedUserId}
                                    onValueChange={setSelectedUserId}
                                    disabled={usersLoading}
                                >
                                    <SelectTrigger className="w-full bg-background">
                                        <SelectValue placeholder={usersLoading ? "Loading users…" : "Select a user"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {users.map((u) => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.username}{" "}
                                                <span className="text-muted-foreground">({u.steamId})</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    The job will run for the selected user&#39;s Steam library.
                                </p>
                            </div>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setStep(1)}>
                                Back
                            </Button>
                            <Button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isPending || (config.requiresUser && !selectedUserId)}
                            >
                                {isPending ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4" />
                                )}
                                Queue Job
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4">
                        <div className={cn(
                            "flex flex-col items-center gap-3 py-6 text-center",
                        )}>
                            <div className={cn(
                                "flex h-14 w-14 items-center justify-center rounded-full",
                                isSuccess ? "bg-primary/10" : "bg-destructive/10",
                            )}>
                                {isSuccess
                                    ? <CheckCircle2 className="h-7 w-7 text-primary" />
                                    : <ShieldAlert className="h-7 w-7 text-destructive" />
                                }
                            </div>
                            <div>
                                <p className="font-semibold text-foreground">
                                    {isSuccess ? "Job queued" : "Failed to queue job"}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">{result?.message}</p>
                                {result?.jobId && (
                                    <p className="mt-1.5 font-mono text-xs text-muted-foreground/70">
                                        ID: {result.jobId}
                                    </p>
                                )}
                            </div>
                        </div>

                        <DialogFooter>
                            {!isSuccess && (
                                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                                    Back
                                </Button>
                            )}
                            <Button type="button" onClick={() => handleOpenChange(false)}>
                                {isSuccess ? "Done" : "Close"}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}