import { type ClassValue,clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind CSS class merging utility. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats a minute count as a human-readable `Xh Ym` string, or `"Never"` if zero. */
export function formatMinutesToHoursMinutes(totalMinutes: number): string {
    const days = Math.floor(totalMinutes / 1_440);
    const hours = Math.floor((totalMinutes % 1_440) / 60);
    const minutes = totalMinutes % 60;

    if (days === 0 && hours === 0 && minutes === 0) {
        return "Never";
    }

    const daysPart = days > 0 ? `${days}d` : "";
    const hoursPart = hours > 0 ? `${hours}h` : "";
    const minutesPart = minutes > 0 ? `${minutes}m` : "";

    return [daysPart, hoursPart, minutesPart].filter(Boolean).join(" ");
}

/** Formats milliseconds as a human-readable `Xh Xm Xs` duration string. */
export function formatDurationMs(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1_000));
    const h = Math.floor(totalSec / 3_600);
    const m = Math.floor((totalSec % 3_600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}