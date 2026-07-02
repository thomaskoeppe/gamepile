import type { ReactNode } from "react";

/**
 * Small summary tile: an icon chip next to a label and value. Used in grid
 * rows on the library and achievements pages.
 */
export function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold truncate">{value}</p>
            </div>
        </div>
    );
}
