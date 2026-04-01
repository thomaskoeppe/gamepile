import {CSSProperties} from "react";

import {cn} from "@/lib/utils";

export function Shimmer({ className, style }: { className?: string; style?: CSSProperties }) {
    return (
        <div
            style={style}
            className={cn(
                "relative overflow-hidden rounded-md bg-muted",
                "before:absolute before:inset-0 before:-translate-x-full",
                "before:animate-[shimmer_1.6s_infinite]",
                "before:bg-linear-to-r before:from-transparent before:via-white/10 before:to-transparent",
                className
            )}
        />
    );
}