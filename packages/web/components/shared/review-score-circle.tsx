"use client";

import { cn } from "@/lib/utils";

interface ReviewScoreCircleProps {
    score: number;
    size?: "sm" | "md" | "lg";
    className?: string;
}

const SIZE_CONFIG = {
    sm: { wh: "w-8 h-8", r: 12, cx: 16, cy: 16, sw: 3, text: "text-[10px]" },
    md: { wh: "w-12 h-12", r: 18, cx: 24, cy: 24, sw: 4, text: "text-sm" },
    lg: { wh: "w-16 h-16", r: 24, cx: 32, cy: 32, sw: 4, text: "text-base" },
} as const;

function getScoreColor(score: number): string {
    if (score >= 75) return "text-green-400";
    if (score >= 50) return "text-yellow-400";
    return "text-red-400";
}

export function ReviewScoreCircle({ score, size = "md", className }: ReviewScoreCircleProps) {
    const config = SIZE_CONFIG[size];
    const circumference = 2 * Math.PI * config.r;
    const strokeDashoffset = circumference - (score / 100) * circumference;
    const color = getScoreColor(score);

    return (
        <div className={cn(
            "relative flex items-center justify-center bg-card/90 backdrop-blur-sm rounded-full shadow-lg border border-border",
            config.wh,
            className,
        )}>
            <svg className="w-full h-full -rotate-90 transform">
                <circle
                    className="text-zinc-700"
                    strokeWidth={config.sw}
                    stroke="currentColor"
                    fill="transparent"
                    r={config.r}
                    cx={config.cx}
                    cy={config.cy}
                />
                <circle
                    className={cn(color, "transition-all duration-500 ease-out")}
                    strokeWidth={config.sw}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={config.r}
                    cx={config.cx}
                    cy={config.cy}
                />
            </svg>
            <span className={cn("absolute font-bold", config.text, color)}>
                {score}
            </span>
        </div>
    );
}

