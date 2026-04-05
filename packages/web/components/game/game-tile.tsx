import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import React, {useCallback, useEffect, useRef, useState} from "react";

import {GameDetailCard} from "@/components/game/game-detail-card";
import { SafeImage } from "@/components/shared/safe-image";
import {cn, formatMinutesToHoursMinutes} from "@/lib/utils";
import {Prisma} from "@/prisma/generated/client";

dayjs.extend(relativeTime);

export function GameTile({ game, onRevalidate }: { game: Prisma.GameGetPayload<{ include: { categories: true, tags: true } }> & { playtime?: number; owned: boolean; }, onRevalidate?: () => void }) {
    const [isVisible, setIsVisible] = useState(false);
    const imgRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);

    const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = useCallback(() => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        setIsHovered(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        hoverTimeout.current = setTimeout(() => setIsHovered(false), 50);
    }, []);

    useEffect(() => {
        return () => {
            if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        };
    }, []);

    useEffect(() => {
        if (!imgRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !isVisible) {
                        setIsVisible(true);
                    } else if (!entry.isIntersecting && isVisible) {
                        setIsVisible(false);
                    }
                });
            },
            {
                rootMargin: "50px",
            },
        );

        observer.observe(imgRef.current);

        return () => observer.disconnect();
    }, [game.appId, isVisible]);

    return (
        <GameDetailCard game={game} onRevalidate={onRevalidate}>
            <div ref={imgRef} className="flex h-full w-full flex-col items-center p-2">
                {isVisible ? (
                    <div
                        className={cn(
                            "relative h-full w-full flex items-center justify-center rounded-lg shadow-md transition-transform duration-300 ease-out",
                            isHovered && "scale-105 ring-white/20 shadow-xl"
                        )}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                    >
                        <SafeImage
                            srcs={[game.libraryCapsuleUrl, game.heroCapsuleUrl]}
                            alt={String(game.id)}
                            className="rounded-lg object-cover h-full w-full"
                            width={200}
                            height={300}
                            fallbackLabel={game.name}
                            fallbackClassName="rounded-lg"
                        />

                        <div
                            className={cn(
                                "absolute inset-0 flex flex-col justify-between rounded-lg p-2",
                                "bg-linear-to-t from-black/90 via-black/50 to-transparent",
                                "transition-opacity duration-300 ease-out",
                                isHovered ? "opacity-100" : "opacity-0"
                            )}
                        >
                            <div className="flex items-start justify-end gap-2">
                            </div>

                            <div
                                className={cn(
                                    "space-y-1 text-foreground transition-all duration-300 ease-out",
                                    isHovered
                                        ? "opacity-100 translate-y-0"
                                        : "opacity-0 translate-y-1"
                                )}
                            >
                                <h3 className="font-semibold text-sm leading-tight line-clamp-2">
                                    {game.name}
                                </h3>
                                {game.owned ? (
                                    <div className="text-xs text-muted-foreground flex flex-col shadow-2xl">
                                        <span>{formatMinutesToHoursMinutes(game.playtime ?? 0)} played</span>
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">Not owned</p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full w-full animate-pulse rounded-lg bg-muted" />
                )}
            </div>
        </GameDetailCard>
    );
}