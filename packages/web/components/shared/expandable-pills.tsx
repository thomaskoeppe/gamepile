import {useState} from "react";

import {Badge} from "@/components/ui/badge";
import {cn} from "@/lib/utils";

export function ExpandablePills({
     items,
     max = 3,
     variant = "outline",
     className
}: {
    items: { id: string; name: string }[] | string[];
    max?: number;
    variant?: "outline" | "secondary" | "default" | "destructive" | null | undefined;
    className?: string;
}) {
    const [expanded, setExpanded] = useState(false);

    const normalized: { id: string; name: string }[] =
        typeof items[0] === "string"
            ? (items as string[]).map((s) => ({ id: s, name: s }))
            : (items as { id: string; name: string }[]);

    const visible = expanded ? normalized : normalized.slice(0, max);
    const overflow = normalized.length - max;

    return (
        <div className={cn("flex flex-wrap gap-1", className)}>
            {visible.map((item) => (
                <Badge
                    key={item.id}
                    variant={variant}
                    className="text-[10px] px-1.5 py-0 border-border/50 text-muted-foreground bg-muted/50"
                >
                    {item.name}
                </Badge>
            ))}

            {!expanded && overflow > 0 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(true);
                    }}
                    className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    +{overflow}
                </button>
            )}
            {expanded && normalized.length > max && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(false);
                    }}
                    className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    less
                </button>
            )}
        </div>
    );
}