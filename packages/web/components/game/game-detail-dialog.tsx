"use client";

import Hls from "hls.js";
import {
    CalendarDays,
    ExternalLink,
    Gem,
    Library,
    Play,
    Tag,
    Trophy,
    Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {useEffect, useRef, useState} from "react";

import { PlatformIcons } from "@/components/shared/platform-icons";
import {ReviewScoreCircle} from "@/components/shared/review-score-circle";
import {SafeImage} from "@/components/shared/safe-image";
import {Shimmer} from "@/components/shared/shimmer";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious} from "@/components/ui/carousel";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Separator} from "@/components/ui/separator";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import type {SearchResult} from "@/lib/actions/search";
import {browserLog} from "@/lib/browser-logger";
import {useServerQuery} from "@/lib/hooks/use-server-query";
import {cn} from "@/lib/utils";
import {getGameDetails} from "@/server/queries/games";
import type {GameDetails} from "@/types/game";

interface GameDetailDialogProps {
    game: SearchResult | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function ScreenshotCarousel({screenshots}: { screenshots: GameDetails["screenshots"] }) {
    if (!screenshots?.length) return null;

    return (
        <Carousel className="w-full" opts={{loop: false}}>
            <CarouselContent>
                {screenshots.map((ss, i) => (
                    <CarouselItem key={ss.id}>
                        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted">
                            <Image
                                src={ss.url}
                                alt={`Screenshot ${i + 1}`}
                                fill
                                className="object-cover"
                            />
                        </div>
                    </CarouselItem>
                ))}
            </CarouselContent>
            <CarouselPrevious className="left-2"/>
            <CarouselNext className="right-2"/>
        </Carousel>
    );
}

function VideoPlayer({videos, maxWidth}: { videos: GameDetails["videos"]; maxWidth?: number }) {
    const [active, setActive] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !videos[active]) return;

        let hls: Hls | null = null;
        const src = videos[active].url;

        if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(src);
            hls.attachMedia(video);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = src;
        }

        return () => {
            hls?.destroy();
            video.src = "";
        };
    }, [active, videos]);

    if (!videos?.length) return null;
    const video = videos[active];

    return (
        <div className="space-y-2">
            <div
                className="relative w-full aspect-video rounded-lg overflow-hidden bg-black"
                style={{maxWidth: maxWidth ? `${maxWidth}px` : undefined}}
            >
                <video
                    key={video.id}
                    ref={videoRef}
                    controls
                    className="w-full h-full"
                    preload="metadata"
                />
            </div>

            {videos.length > 1 && (
                <Carousel className="w-full" opts={{loop: false}}>
                    <CarouselContent className="-ml-1.5">
                        {videos.map((v, i) => (
                            <CarouselItem key={v.id} className="pl-1.5 basis-auto">
                                <button
                                    onClick={() => setActive(i)}
                                    className={cn(
                                        "relative w-24 h-14 shrink-0 rounded overflow-hidden border-2 transition-all group",
                                        i === active
                                            ? "border-primary"
                                            : "border-transparent opacity-60 hover:opacity-100"
                                    )}
                                >
                                    <div className="w-full h-full bg-muted"/>
                                    <div
                                        className="absolute inset-0 flex items-center justify-center bg-black/40">
                                        <Play className="size-4 text-white"/>
                                    </div>
                                </button>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    <CarouselPrevious className="left-0 -translate-x-1/2"/>
                    <CarouselNext className="right-0 translate-x-1/2"/>
                </Carousel>
            )}
        </div>
    );
}

export function GameDetailDialog({game, open, onOpenChange}: GameDetailDialogProps) {
    const appId = game?.appId;
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentWidth, setContentWidth] = useState<number | undefined>(undefined);

    const gameId = game?.id ?? null;

    useEffect(() => {
        if (open && game) {
            browserLog.info('Game detail dialog opened', {gameId: game.id, gameName: game.name, appId: game.appId});
        }
    }, [open, game]);

    const {data, isLoading: detailsLoading, mutate} = useServerQuery(
        open && gameId ? ["game-detail-dialog", appId] : null,
        async () => {
            if (!gameId) throw new Error("No game selected");
            return getGameDetails({gameId});
        },
        {keepPreviousData: true},
    );

    const detailsError = data && !data.success;
    const details = open && data?.success ? data?.data : null;

    const reviewScore = details?.reviewPercentage ?? null;
    const isFree = details?.isFree ?? game?.metadata?.isFree;
    const description = details?.shortDescription ?? game?.description;

    const hasMedia =
        (details?.screenshots?.length ?? 0) > 0 || (details?.videos?.length ?? 0) > 0;

    useEffect(() => {
        if (!open) return;

        let frame = 0;
        let resizeObserver: ResizeObserver | null = null;

        const setupObserver = () => {
            const element = contentRef.current;
            if (!element) {
                frame = requestAnimationFrame(setupObserver);
                return;
            }

            const updateWidth = () => {
                const width = element.clientWidth;
                if (width > 0) {
                    setContentWidth(Math.max(width - 48, 300));
                }
            };

            updateWidth();
            resizeObserver = new ResizeObserver(updateWidth);
            resizeObserver.observe(element);
        };

        setupObserver();

        return () => {
            if (frame) cancelAnimationFrame(frame);
            resizeObserver?.disconnect();
        };
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent ref={contentRef} className="sm:max-w-2xl p-0 gap-0 flex flex-col overflow-hidden">
                <DialogHeader className="sr-only">
                    <DialogTitle>{game?.name ?? "Game Details"}</DialogTitle>
                </DialogHeader>

                <div className="relative w-full h-52 bg-muted shrink-0">
                    {appId ? (
                        <SafeImage
                            srcs={[
                                details?.libraryHeroUrl ?? null,
                                details?.headerImageUrl ?? null,
                                `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
                                `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`,
                            ]}
                            alt={game?.name ?? "Game"}
                            fill
                            className="object-cover object-[center_30%]"
                            fallback={<Shimmer className="w-full h-full"/>}
                        />
                    ) : (
                        <Shimmer className="w-full h-full"/>
                    )}

                    <div className="absolute inset-0 bg-linear-to-t from-card via-card/50 to-transparent"/>

                    <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-bold text-foreground tracking-tight drop-shadow-lg flex items-center gap-2 flex-wrap">
                                {isFree && <Gem className="size-4 text-primary shrink-0"/>}
                                <span className="truncate">{game?.name}</span>
                            </h2>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                {appId && (
                                    <p className="text-xs text-muted-foreground">App ID: {appId}</p>
                                )}
                                {details?.platforms && (
                                    <PlatformIcons platforms={details.platforms}/>
                                )}
                                {isFree && (
                                    <Badge className="border-primary/40 bg-primary/15 text-xs text-primary">
                                        Free to Play
                                    </Badge>
                                )}
                            </div>
                        </div>

                        {reviewScore !== null && <ReviewScoreCircle score={reviewScore}/>}
                    </div>
                </div>

                <Tabs defaultValue="overview" className="flex flex-col flex-1">
                    <TabsList className="mx-6 mt-4 mb-0 shrink-0 w-auto self-start">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        {hasMedia && <TabsTrigger value="media">Media</TabsTrigger>}
                    </TabsList>

                    <TabsContent
                        value="overview"
                        className="focus-visible:outline-none"
                    >
                        <ScrollArea className="h-120 px-6 pb-2 mt-4">
                            {detailsLoading && !details ? (
                                <div className="space-y-4">
                                    <Shimmer className="h-4 w-full rounded" />
                                    <Shimmer className="h-4 w-3/4 rounded" />
                                    <Shimmer className="h-4 w-1/2 rounded" />
                                    <Shimmer className="h-px w-full" />
                                    <div className="grid grid-cols-2 gap-4">
                                        <Shimmer className="h-12 rounded" />
                                        <Shimmer className="h-12 rounded" />
                                        <Shimmer className="h-12 rounded" />
                                        <Shimmer className="h-12 rounded" />
                                    </div>
                                </div>
                            ) : detailsError ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                                    <p className="text-sm text-muted-foreground">
                                        Failed to load game details. The game may not have been synced yet.
                                    </p>
                                    <Button variant="outline" size="sm" onClick={() => void mutate()}>
                                        Try Again
                                    </Button>
                                </div>
                            ) : (
                            <div className="space-y-5">
                                {description && (
                                    <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                                )}

                                <Separator/>

                                {(details?.reviewCount || details?._count?.achievements) && (
                                    <div className="flex items-center gap-6 flex-wrap">
                                        {details.reviewCount != null && details.reviewCount > 0 && (
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <Users className="size-4 text-muted-foreground"/>
                                                <span className="font-semibold text-foreground">
                                                    {details.reviewCount.toLocaleString()}
                                                </span>
                                                <span className="text-muted-foreground">reviews</span>
                                                {details.reviewScoreLabel && (
                                                    <Badge variant="outline" className="text-xs ml-1">
                                                        {details.reviewScoreLabel}
                                                    </Badge>
                                                )}
                                            </div>
                                        )}
                                        {details._count?.achievements != null && details._count.achievements > 0 && (
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <Trophy className="size-4 text-muted-foreground"/>
                                                <span className="font-semibold text-foreground">
                                                    {details._count.achievements}
                                                </span>
                                                <span className="text-muted-foreground">achievements</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {details?.achievements && details.achievements.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">
                                            Notable Achievements
                                        </p>
                                        <div className="flex gap-3 flex-wrap">
                                            {details.achievements.map((a) => (
                                                <div key={a.id}
                                                     className="flex flex-col items-center gap-1 w-10">
                                                    <div
                                                        className="relative w-10 h-10 rounded bg-muted overflow-hidden">
                                                        <Image src={a.icon} alt={a.displayName} fill
                                                               className="object-cover"/>
                                                    </div>
                                                    <span
                                                        className="text-[9px] text-muted-foreground text-center line-clamp-2 leading-tight">
                                                        {a.displayName}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                    {(details?.releaseDate || game?.metadata?.releaseDate) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1">
                                                Release Date
                                            </p>
                                            <span className="text-foreground flex items-center gap-1.5 text-xs">
                                                <CalendarDays className="size-3.5 shrink-0"/>
                                                {details?.releaseDate
                                                    ? new Date(details.releaseDate).toLocaleDateString(undefined, {
                                                        year: "numeric",
                                                        month: "long",
                                                        day: "numeric",
                                                    })
                                                    : game?.metadata?.releaseDate
                                                        ? new Date(String(game.metadata.releaseDate)).toLocaleDateString(undefined, {
                                                            year: "numeric",
                                                            month: "long",
                                                            day: "numeric",
                                                        })
                                                        : "TBA"}
                                            </span>
                                        </div>
                                    )}

                                    {(details?.type || game?.metadata?.type) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1">
                                                Type
                                            </p>
                                            <Badge variant="outline" className="text-xs capitalize">
                                                {(details?.type ?? String(game?.metadata?.type)).toLowerCase()}
                                            </Badge>
                                        </div>
                                    )}

                                    {(details?.developers?.length || game?.metadata?.developers) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1">
                                                Developer
                                            </p>
                                            <p className="text-foreground text-xs">
                                                {details?.developers?.join(", ") ?? String(game?.metadata?.developers)}
                                            </p>
                                        </div>
                                    )}

                                    {(details?.publishers?.length || game?.metadata?.publishers) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1">
                                                Publisher
                                            </p>
                                            <p className="text-foreground text-xs">
                                                {details?.publishers?.join(", ") ?? String(game?.metadata?.publishers)}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {details?.tags && details.tags.length > 0 && (
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-2">
                                            Tags
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {details.tags.map((t) => (
                                                <Badge key={t.id} variant="secondary" className="text-xs">
                                                    <Tag className="w-3 h-3 mr-1"/>
                                                    {t.name}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {details?.categories && details.categories.length > 0 && (
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-2">
                                            Features
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {details.categories.map((c) => (
                                                <Badge key={c.id} variant="outline" className="text-xs">
                                                    {c.name}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {details?.tags && details.tags.length > 0 && (
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-2">
                                            Tags
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {details.tags.slice(0, 12).map((t) => (
                                                <Badge key={t.id} variant="outline"
                                                       className="text-xs font-normal">
                                                    {t.name}
                                                </Badge>
                                            ))}
                                            {details.tags.length > 12 && (
                                                <Badge variant="outline"
                                                       className="text-xs font-normal text-muted-foreground">
                                                    +{details.tags.length - 12} more
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <Separator/>

                                <div className="flex items-center gap-3 flex-wrap">
                                    {appId && (
                                        <Button variant="outline" size="sm" asChild>
                                            <Link
                                                href={`https://store.steampowered.com/app/${appId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                        <ExternalLink className="size-4"/>
                                                View on Steam
                                            </Link>
                                        </Button>
                                    )}
                                    <Button variant="outline" size="sm" asChild>
                                        <Link
                                            href={`/explore?search=${encodeURIComponent(game?.name ?? "")}`}>
                                            <Library className="size-4"/>
                                            Open in Explorer
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                            )}
                        </ScrollArea>
                    </TabsContent>

                    {hasMedia && (
                        <TabsContent
                            value="media"
                            className="focus-visible:outline-none"
                        >
                            <ScrollArea className="h-120 px-6 pb-2 mt-4">
                                <div className="space-y-5">
                                    {details?.videos && details.videos.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">
                                                Trailers & Videos
                                            </p>
                                            <VideoPlayer videos={details.videos} maxWidth={contentWidth}/>
                                        </div>
                                    )}

                                    {details?.screenshots && details.screenshots.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">
                                                Screenshots
                                            </p>
                                            <ScreenshotCarousel screenshots={details.screenshots}/>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    )}
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}