import {CalendarDays, Gem, Library} from "lucide-react";
import Link from "next/link";
import {ReactNode, useState} from "react";

import {AddToCollectionDropdown} from "@/components/game/add-to-collection-dropdown";
import { ExpandablePills } from "@/components/shared/expandable-pills";
import { PlatformIcon } from "@/components/shared/platform-icons";
import { ReviewScoreCircle } from "@/components/shared/review-score-circle";
import { SafeImage } from "@/components/shared/safe-image";
import {Button} from "@/components/ui/button";
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {useSession} from "@/lib/providers/session";
import {Platform} from "@/prisma/generated/enums";
import { GameGetPayload } from "@/prisma/generated/models/Game";

export function GameDetailCard({ game, children, onRevalidate }: {
    game: GameGetPayload<{ include: { categories: true; tags: true } }>;
    children: ReactNode;
    onRevalidate?: () => void;
}) {
    const { authenticated } = useSession();
    const [hovered, setHovered] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const show = hovered || dropdownOpen;

    return (
        <HoverCard openDelay={200} closeDelay={300} open={show} onOpenChange={setHovered}>
            <HoverCardTrigger asChild>{children}</HoverCardTrigger>

            <HoverCardContent
                side="right"
                align="start"
                sideOffset={8}
                className="w-125 overflow-hidden border-border bg-card p-0 text-card-foreground shadow-2xl pointer-events-auto"
                onPointerLeave={(e) => {
                  if (dropdownOpen) e.preventDefault();
                }}
            >
                <div className="relative w-full h-40 bg-background group">
                    <div className="absolute inset-0 transform group-hover:scale-105 transition-transform duration-300 ease-out">
                        <SafeImage
                            srcs={[
                                game.headerImageUrl,
                                game.libraryHeroUrl
                            ]}
                            alt={`${game.name}`}
                            fill
                            className="object-cover object-[center_30%]"
                            fallbackLabel={game.name}
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-card via-card/60 to-transparent" />
                    </div>

                    <div className="absolute bottom-3 left-4 right-4 flex justify-between items-end">
                        <div className="flex-1 mr-4">
                            <h3 className="text-lg font-bold text-foreground tracking-tight drop-shadow-lg truncate">
                                {game.isFree && (
                                    <Gem className="mr-1.5 inline-block size-4 text-primary opacity-80" />
                                )}
                                {game.name}
                            </h3>
                            <div className="flex items-center text-xs text-muted-foreground mt-1">
                                <CalendarDays className="mr-1.5 size-3 opacity-70" />
                                {game.releaseDate
                                    ? new Date(game.releaseDate).toLocaleDateString(undefined, {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                    })
                                    : "TBA"}
                            </div>
                        </div>

                        {game.reviewPercentage != null && (
                            <div className="mb-1 shrink-0">
                                <ReviewScoreCircle score={game.reviewPercentage} size="sm" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 text-sm">
                    <div className="mb-4">
                        <p className="text-muted-foreground leading-relaxed line-clamp-2">
                            {game.shortDescription}
                        </p>
                    </div>

                    <div className="grid grid-cols-[120px_1fr] gap-4">
                        <div className="space-y-5">
                            <div>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 block mb-2">
                                  Platforms
                                </span>

                                <div className="flex items-center flex-wrap gap-3 text-muted-foreground">
                                    {game.platforms.map((p: Platform) => (
                                        <Tooltip key={p}>
                                            <TooltipTrigger>
                                                <PlatformIcon key={p} platform={p} />
                                            </TooltipTrigger>
                                            <TooltipContent>{p}</TooltipContent>
                                        </Tooltip>
                                    ))}
                                </div>

                                {game.platforms.length === 0 && (
                                    <span className="text-xs text-muted-foreground leading-snug">
                                      N/A
                                    </span>
                                )}
                            </div>

                            <div>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 block mb-1.5">
                                  Developer
                                </span>

                                <span className="text-xs text-muted-foreground leading-snug">
                                  {game.developers.length > 0 ? game.developers.join(", ") : "N/A"}
                                </span>
                            </div>

                            <div>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 block mb-1.5">
                                  Publisher
                                </span>

                                <span className="text-xs text-muted-foreground leading-snug">
                                  {game.publishers.length > 0 ? game.publishers.join(", ") : "N/A"}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-3 border-l border-border pl-4">
                            <div>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 block mb-1">
                                  Tags
                                </span>

                                <div className="flex flex-wrap gap-1.5">
                                    {game.tags.length === 0 ? (
                                        <span className="text-xs text-muted-foreground leading-snug">
                                          N/A
                                        </span>
                                    ) : (
                                        <ExpandablePills items={game.tags} max={3} />
                                    )}
                                </div>
                            </div>

                            <Separator className="bg-border my-2" />

                            <div>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 block mb-1">
                                  Categories
                                </span>

                                {game.categories.length === 0 ? (
                                    <span className="text-xs text-muted-foreground leading-snug">
                                          N/A
                                        </span>
                                ) : (
                                    <ExpandablePills items={game.categories} max={11} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="pointer-events-auto">
                        <Separator className="bg-border my-3" />

                        {authenticated ? (
                            <AddToCollectionDropdown gameId={game.id} side="top" align="start" onOpenChange={(open) => {
                                if (!open) setHovered(false);
                                setDropdownOpen(open);
                            }} onRevalidate={onRevalidate}>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="justify-start gap-2 h-8 cursor-pointer text-muted-foreground"
                                >
                                    <Library className="size-3.5" />
                                    <span className="text-xs">Add to Collection</span>
                                </Button>
                            </AddToCollectionDropdown>
                        ) : (
                            <div className="flex justify-start gap-2 h-8 text-muted-foreground">
                                <span className="text-xs"><Link href="/" className="text-primary underline underline-offset-4 hover:text-primary/80">Sign in</Link>{" "} to add game to collection</span>
                            </div>
                        )}
                    </div>
                </div>
            </HoverCardContent>
        </HoverCard>
    );
}