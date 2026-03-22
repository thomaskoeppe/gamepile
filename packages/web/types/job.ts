import { JobStatus, JobType } from "@/prisma/generated/enums";

export type JobLogEntry = {
    id: string;
    message: string;
    level: string;
    timestamp: string;
};

export type JobSnapshot = {
    id: string;
    type: JobType;
    status: JobStatus;
    processedItems: number;
    totalItems: number;
    failedItems: number;
    allItemsQueued: boolean;
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
    createdAt: string;
    logs: JobLogEntry[];
};

const TERMINAL_STATUSES = new Set<JobStatus>([
    JobStatus.COMPLETED,
    JobStatus.PARTIALLY_COMPLETED,
    JobStatus.FAILED,
    JobStatus.CANCELED,
]);

export function isTerminal(status: JobStatus): boolean {
    return TERMINAL_STATUSES.has(status);
}

export const JOB_TYPE_LABEL: Record<JobType, string> = {
    SYNC_STEAM_GAMES:        "Steam Game Sync",
    IMPORT_USER_LIBRARY:     "Library Import",
    IMPORT_USER_ACHIEVEMENTS: "Achievement Import",
    REFRESH_GAME_DETAILS:    "Refresh Game Details",
};