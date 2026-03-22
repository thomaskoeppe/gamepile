"use client";

import Hls from "hls.js";
import {
    Apple,
    CalendarDays,
    Cpu,
    ExternalLink,
    Gem,
    Globe,
    Library,
    Monitor,
    Package,
    Play,
    Star,
    Tag,
    Terminal,
    Trophy,
    Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {useEffect, useRef, useState} from "react";

import { SafeImage } from "@/components/safe-image";
import { Shimmer } from "@/components/shimmer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SearchResult } from "@/lib/actions/search";
import { browserLog } from "@/lib/browser-logger";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { cn } from "@/lib/utils";
import { getGameDetails } from "@/server/queries/games";
import type { SteamAppDetails } from "@/types/steam";

interface GameDetailDialogProps {
    game: SearchResult | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function PlatformIcons({ platforms }: { platforms: SteamAppDetails["platforms"] }) {
    return (
        <div className="flex items-center gap-2">
            {platforms.windows && <Monitor className="w-4 h-4 text-muted-foreground" />}
            {platforms.mac && <Apple className="w-4 h-4 text-muted-foreground" />}
            {platforms.linux && <Terminal className="w-4 h-4 text-muted-foreground" />}
        </div>
    );
}

function MetacriticBadge({ score }: { score: number }) {
    return (
        <div
            className={cn(
                "flex items-center justify-center w-12 h-12 rounded-full border-2 font-bold text-sm shrink-0",
                score >= 75 && "border-green-500 text-green-400",
                score >= 50 && score < 75 && "border-yellow-500 text-yellow-400",
                score < 50 && "border-red-500 text-red-400",
            )}
            title="Metacritic Score"
        >
            {score}
        </div>
    );
}

function PriceTag({ price }: { price: SteamAppDetails["price_overview"] }) {
    if (!price) return null;
    const hasDiscount = price.discount_percent > 0;
    return (
        <div className="flex items-center gap-2">
            {hasDiscount && (
                <span className="bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                    -{price.discount_percent}%
                </span>
            )}
            {hasDiscount && (
                <span className="text-xs text-muted-foreground line-through">{price.initial_formatted}</span>
            )}
            <span className={cn("text-sm font-semibold", hasDiscount && "text-green-400")}>
                {price.final_formatted}
            </span>
        </div>
    );
}

function RequirementsBlock({ label, html }: { label: string; html?: string }) {
    if (!html) return null;
    const text = stripHtml(html);
    const lines = text
        .replace(/([A-Z][a-z]+:)/g, "\n$1")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    return (
        <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">{label}</p>
            <ul className="space-y-1">
                {lines.map((line, i) => {
                    const isHeader = /^[A-Z][a-z]+:/.test(line);
                    return (
                        <li
                            key={i}
                            className={cn(
                                "text-xs leading-relaxed",
                                isHeader ? "font-semibold text-foreground mt-2" : "text-muted-foreground",
                            )}
                        >
                            {isHeader ? <Cpu className="w-3 h-3 inline mr-1 mb-0.5" /> : "• "}
                            {line}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function ScreenshotCarousel({ screenshots }: { screenshots: SteamAppDetails["screenshots"] }) {
    if (!screenshots?.length) return null;

    return (
        <Carousel className="w-full" opts={{ loop: false }}>
            <CarouselContent>
                {screenshots.map((ss, i) => (
                    <CarouselItem key={ss.id}>
                        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted">
                            <Image
                                src={ss.path_full}
                                alt={`Screenshot ${i + 1}`}
                                fill
                                className="object-cover"
                            />
                        </div>
                    </CarouselItem>
                ))}
            </CarouselContent>
            <CarouselPrevious className="left-2" />
            <CarouselNext className="right-2" />
        </Carousel>
    );
}

function VideoPlayer({ movies, maxWidth }: { movies: SteamAppDetails["movies"]; maxWidth?: number }) {
    const [active, setActive] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let hls: Hls | null = null;

        if (movies[active].hls_h264) {
            if (Hls.isSupported()) {
                hls = new Hls();
                hls.loadSource(movies[active].hls_h264);
                hls.attachMedia(video);
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = movies[active].hls_h264;
            }
        }

        return () => {
            hls?.destroy();
            video.src = "";
        };
    }, [active, movies]);

    if (!movies?.length) return null;
    const movie = movies[active];

    const mp4Src = movie.mp4?.["480"] ?? movie.mp4?.max;
    const webmSrc = movie.webm?.["480"] ?? movie.webm?.max;

    return (
        <div className="space-y-2">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black" style={{ maxWidth: maxWidth ? `${maxWidth}px` : undefined }}>
                <video
                    key={movie.id}
                    ref={videoRef}
                    controls
                    poster={movie.thumbnail}
                    className="w-full h-full"
                    preload="metadata"
                >
                    {mp4Src && <source src={mp4Src} type="video/mp4" />}
                    {webmSrc && <source src={webmSrc} type="video/webm" />}
                </video>
            </div>

            {movies.length > 1 && (
                <Carousel className="w-full" opts={{ loop: false }}>
                    <CarouselContent className="-ml-1.5">
                        {movies.map((m, i) => (
                            <CarouselItem key={m.id} className="pl-1.5 basis-auto">
                                <button
                                    onClick={() => setActive(i)}
                                    className={cn(
                                        "relative w-24 h-14 shrink-0 rounded overflow-hidden border-2 transition-all group",
                                        i === active
                                            ? "border-primary"
                                            : "border-transparent opacity-60 hover:opacity-100"
                                    )}
                                >
                                    <Image src={m.thumbnail} alt={m.name} fill className="object-cover" />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                        <Play className="w-4 h-4 text-white" />
                                    </div>
                                </button>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    <CarouselPrevious className="left-0 -translate-x-1/2" />
                    <CarouselNext className="right-0 translate-x-1/2" />
                </Carousel>
            )}
        </div>
    );
}

export function GameDetailDialog({ game, open, onOpenChange }: GameDetailDialogProps) {
    const appId = game?.appId;
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentWidth, setContentWidth] = useState<number | undefined>(undefined);

    const gameId = game?.id ?? null;

    useEffect(() => {
        if (open && game) {
            browserLog.info('Game detail dialog opened', { gameId: game.id, gameName: game.name, appId: game.appId });
        }
    }, [open, game]);

    const { data } = useServerQuery(
        open && gameId ? ["game-detail-dialog", appId] : null,
        async () => {
            if (!gameId) throw new Error("No game selected");
            return getGameDetails({ gameId });
        },
        { keepPreviousData: true },
    );

    const details = open && data?.success ? data?.data : null;


    const metacriticScore =
        details?.metacritic?.score ??
        (game?.metadata?.metacriticScore ? Number(game.metadata.metacriticScore) : null);

    const isFree = details?.is_free ?? game?.metadata?.isFree;
    const description = details?.short_description ?? game?.description;

    const languages = details?.supported_languages
        ? stripHtml(details.supported_languages)
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean)
        : [];

    const hasMedia =
        (details?.screenshots?.length ?? 0) > 0 || (details?.movies?.length ?? 0) > 0;

    const hasRequirements =
        details?.pc_requirements?.minimum ||
        details?.pc_requirements?.recommended ||
        details?.mac_requirements?.minimum ||
        details?.linux_requirements?.minimum;

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
                                `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
                                `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/header.jpg`,
                            ]}
                            alt={game?.name ?? "Game"}
                            fill
                            className="object-cover object-[center_30%]"
                            fallback={<Shimmer className="w-full h-full" />}
                        />
                    ) : (
                        <Shimmer className="w-full h-full" />
                    )}

                    <div className="absolute inset-0 bg-linear-to-t from-card via-card/50 to-transparent" />

                    <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-bold text-foreground tracking-tight drop-shadow-lg flex items-center gap-2 flex-wrap">
                                {isFree && <Gem className="w-4 h-4 text-blue-400 shrink-0" />}
                                <span className="truncate">{game?.name}</span>
                            </h2>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                {appId && (
                                    <p className="text-xs text-muted-foreground">App ID: {appId}</p>
                                )}
                                {details?.platforms && (
                                    <PlatformIcons platforms={details.platforms} />
                                )}
                                {details?.price_overview ? (
                                    <PriceTag price={details.price_overview} />
                                ) : isFree ? (
                                    <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30 text-xs">
                                        Free to Play
                                    </Badge>
                                ) : null}
                            </div>
                        </div>

                        {metacriticScore !== null && <MetacriticBadge score={metacriticScore} />}
                    </div>
                </div>

                <Tabs defaultValue="overview" className="flex flex-col flex-1">
                    <TabsList className="mx-6 mt-4 mb-0 shrink-0 w-auto self-start">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        {hasMedia && <TabsTrigger value="media">Media</TabsTrigger>}
                        {hasRequirements && <TabsTrigger value="requirements">Requirements</TabsTrigger>}
                    </TabsList>

                    <TabsContent
                        value="overview"
                        className="focus-visible:outline-none"
                    >
                        <ScrollArea className="h-120 px-6 pb-2 mt-4">
                            <div className="space-y-5">
                                {description && (
                                    <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                                )}

                                <Separator />

                                {(details?.recommendations || details?.achievements) && (
                                    <div className="flex items-center gap-6 flex-wrap">
                                        {details.recommendations && (
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <Users className="w-4 h-4 text-muted-foreground" />
                                                <span className="font-semibold text-foreground">
                                                {details.recommendations.total.toLocaleString()}
                                            </span>
                                                <span className="text-muted-foreground">recommendations</span>
                                            </div>
                                        )}
                                        {details.achievements && (
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <Trophy className="w-4 h-4 text-muted-foreground" />
                                                <span className="font-semibold text-foreground">
                                                {details.achievements.total}
                                            </span>
                                                <span className="text-muted-foreground">achievements</span>
                                            </div>
                                        )}
                                        {details.dlc && details.dlc.length > 0 && (
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <Package className="w-4 h-4 text-muted-foreground" />
                                                <span className="font-semibold text-foreground">{details.dlc.length}</span>
                                                <span className="text-muted-foreground">DLCs</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {details?.achievements?.highlighted && details.achievements.highlighted.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">
                                            Notable Achievements
                                        </p>
                                        <div className="flex gap-3 flex-wrap">
                                            {details.achievements.highlighted.slice(0, 6).map((a) => (
                                                <div key={a.name} className="flex flex-col items-center gap-1 w-10">
                                                    <div className="relative w-10 h-10 rounded bg-muted overflow-hidden">
                                                        <Image src={a.path} alt={a.name} fill className="object-cover" />
                                                    </div>
                                                    <span className="text-[9px] text-muted-foreground text-center line-clamp-2 leading-tight">
                                                    {a.name}
                                                </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                    {(details?.release_date?.date || game?.metadata?.releaseDate) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1">
                                                Release Date
                                            </p>
                                            <span className="text-foreground flex items-center gap-1.5 text-xs">
                                            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                                                {details?.release_date?.coming_soon
                                                    ? `Coming soon — ${details.release_date.date}`
                                                    : details?.release_date?.date ??
                                                    new Date(String(game?.metadata?.releaseDate)).toLocaleDateString(
                                                        undefined,
                                                        { year: "numeric", month: "long", day: "numeric" },
                                                    )}
                                        </span>
                                        </div>
                                    )}

                                    {(details?.type || game?.metadata?.type) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1">
                                                Type
                                            </p>
                                            <Badge variant="outline" className="text-xs capitalize">
                                                {details?.type ?? String(game?.metadata?.type)}
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

                                    {details?.website && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1">
                                                Website
                                            </p>
                                            <a
                                                href={details.website}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-primary hover:underline flex items-center gap-1"
                                            >
                                                <Globe className="w-3 h-3" />
                                                Official site
                                            </a>
                                        </div>
                                    )}

                                    {details?.required_age && details.required_age !== "0" && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-1">
                                                Age Rating
                                            </p>
                                            <Badge variant="destructive" className="text-xs">
                                                {details.required_age}+
                                            </Badge>
                                        </div>
                                    )}
                                </div>

                                {(details?.genres?.length || game?.metadata?.genres) && (
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-2">
                                            Genres
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {details?.genres
                                                ? details.genres.map((g) => (
                                                    <Badge key={g.id} variant="secondary" className="text-xs">
                                                        <Tag className="w-3 h-3 mr-1" />
                                                        {g.description}
                                                    </Badge>
                                                ))
                                                : String(game?.metadata?.genres)
                                                    .split(",")
                                                    .map((g) => (
                                                        <Badge key={g.trim()} variant="secondary" className="text-xs">
                                                            <Tag className="w-3 h-3 mr-1" />
                                                            {g.trim()}
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
                                                    {c.description}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {languages.length > 0 && (
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 mb-2">
                                            Languages
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                            {languages.slice(0, 12).map((l) => (
                                                <Badge key={l} variant="outline" className="text-xs font-normal">
                                                    {l}
                                                </Badge>
                                            ))}
                                            {languages.length > 12 && (
                                                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                                    +{languages.length - 12} more
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {details?.metacritic?.url && (
                                    <>
                                        <Separator />
                                        <div className="flex items-center gap-2 text-sm">
                                            <Star className="w-4 h-4 text-yellow-400" />
                                            <span className="text-muted-foreground">Metacritic score:</span>
                                            <span className="font-semibold text-foreground">{details.metacritic.score}</span>
                                            <a
                                                href={details.metacritic.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-primary hover:underline flex items-center gap-0.5 ml-1"
                                            >
                                                View review <ExternalLink className="w-3 h-3 ml-0.5" />
                                            </a>
                                        </div>
                                    </>
                                )}

                                <Separator />

                                <div className="flex items-center gap-3 flex-wrap">
                                    {appId && (
                                        <Button variant="outline" size="sm" asChild>
                                            <Link
                                                href={`https://store.steampowered.com/app/${appId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                                View on Steam
                                            </Link>
                                        </Button>
                                    )}
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={`/explore?search=${encodeURIComponent(game?.name ?? "")}`}>
                                            <Library className="w-4 h-4" />
                                            Open in Explorer
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    {hasMedia && (
                        <TabsContent
                            value="media"
                            className="focus-visible:outline-none"
                        >
                            <ScrollArea className="h-120 px-6 pb-2 mt-4">
                                <div className="space-y-5">
                                    {details?.movies && details.movies.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">
                                                Trailers & Videos
                                            </p>
                                            <VideoPlayer movies={details.movies} maxWidth={contentWidth} />
                                        </div>
                                    )}

                                    {details?.screenshots && details.screenshots.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">
                                                Screenshots
                                            </p>
                                            <ScreenshotCarousel screenshots={details.screenshots} />
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    )}

                    {hasRequirements && (
                        <TabsContent
                            value="requirements"
                            className="focus-visible:outline-none"
                        >
                            <ScrollArea className="h-120 px-6 pb-2 mt-4">
                                <div className="space-y-5">
                                    {(details?.pc_requirements?.minimum || details?.pc_requirements?.recommended) && (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                                <Monitor className="w-4 h-4" /> Windows
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                <RequirementsBlock label="Minimum" html={details?.pc_requirements?.minimum} />
                                                <RequirementsBlock label="Recommended" html={details?.pc_requirements?.recommended} />
                                            </div>
                                        </div>
                                    )}

                                    {(details?.mac_requirements?.minimum || details?.mac_requirements?.recommended) && (
                                        <>
                                            <Separator />
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                                    <Apple className="w-4 h-4" /> macOS
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                    <RequirementsBlock label="Minimum" html={details?.mac_requirements?.minimum} />
                                                    <RequirementsBlock label="Recommended" html={details?.mac_requirements?.recommended} />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {(details?.linux_requirements?.minimum || details?.linux_requirements?.recommended) && (
                                        <>
                                            <Separator />
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                                    <Terminal className="w-4 h-4" /> Linux
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                    <RequirementsBlock label="Minimum" html={details?.linux_requirements?.minimum} />
                                                    <RequirementsBlock label="Recommended" html={details?.linux_requirements?.recommended} />
                                                </div>
                                            </div>
                                        </>
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