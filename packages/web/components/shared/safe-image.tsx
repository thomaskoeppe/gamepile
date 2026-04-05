"use client";

import { Package } from "lucide-react";
import Image, { type ImageProps } from "next/image";
import { type ReactNode, useCallback, useState } from "react";

import { cn } from "@/lib/utils";

interface SafeImageProps extends Omit<ImageProps, "src" | "onError"> {
    /** Ordered list of image URLs to try. Falls through on error. */
    srcs: Array<string | null>;
    /** Content shown when all URLs fail. Defaults to a muted icon + optional label. */
    fallback?: ReactNode;
    /** Label shown in the default fallback (only used when `fallback` is not provided). */
    fallbackLabel?: string;
    /** Extra className for the fallback container. */
    fallbackClassName?: string;
}

/**
 * Renders a Next.js `Image` that falls through a prioritized list of source URLs
 * on error. Displays a customizable fallback when all sources are exhausted.
 *
 * @param srcs - Ordered list of image URLs to try. Falls through to the next on error.
 * @param fallback - Custom React node shown when all URLs fail. Overrides the default icon fallback.
 * @param fallbackLabel - Label shown in the default muted icon fallback (ignored when `fallback` is set).
 * @param fallbackClassName - Extra className applied to the default fallback container.
 * @param className - ClassName applied to the `Image` component.
 * @param imageProps - Other props passed to the `Image` component (e.g. `alt`, `width`, `height`).
 * @returns A React element rendering the image or fallback content.
 */
export function SafeImage({
    srcs,
    fallback,
    fallbackLabel,
    fallbackClassName,
    className,
    ...imageProps
}: SafeImageProps) {
    const imageSrcs = srcs.filter((src) => src !== null && src.trim() !== "") as string[];

    const [index, setIndex] = useState(0);
    const failed = index >= imageSrcs.length;

    const handleError = useCallback(() => {
        setIndex((prev) => prev + 1);
    }, []);

    if (failed || imageSrcs.length === 0) {
        if (fallback) return <>{fallback}</>;

        return (
            <div
                className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/50",
                    fallbackClassName,
                )}
            >
                <Package className="h-8 w-8 text-muted-foreground/30" />
                {fallbackLabel && (
                    <span className="text-[11px] text-muted-foreground/40 text-center px-4 line-clamp-2">
                        {fallbackLabel}
                    </span>
                )}
            </div>
        );
    }

    return (
        <Image
            {...imageProps}
            src={imageSrcs[index]}
            className={className}
            onError={handleError}
            alt={imageProps.alt || ""}
        />
    );
}

