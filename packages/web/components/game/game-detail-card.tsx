import {CalendarDays, Gem, Library} from "lucide-react";
import Link from "next/link";
import {ReactNode, useState} from "react";

import {AddToCollectionDropdown} from "@/components/game/add-to-collection-dropdown";
import { ExpandablePills } from "@/components/shared/expandable-pills";
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

const PlatformIcon = ({ platform }: { platform: Platform }) => {
    const cn = "w-3.5 h-3.5 fill-current";

    switch (platform) {
        case Platform.WINDOWS:
            return (
                <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" width="800px" height="800px" viewBox="0 0 20 20" version="1.1" className={cn}>
                    <g>
                        <g id="Dribbble-Light-Preview" transform="translate(-60.000000, -7439.000000)">
                            <g id="icons" transform="translate(56.000000, 160.000000)">
                                <path d="M13.1458647,7289.43426 C13.1508772,7291.43316 13.1568922,7294.82929 13.1619048,7297.46884 C16.7759398,7297.95757 20.3899749,7298.4613 23.997995,7299 C23.997995,7295.84873 24.002005,7292.71146 23.997995,7289.71311 C20.3809524,7289.71311 16.7649123,7289.43426 13.1458647,7289.43426 M4,7289.43526 L4,7296.22153 C6.72581454,7296.58933 9.45162907,7296.94113 12.1724311,7297.34291 C12.1774436,7294.71736 12.1704261,7292.0908 12.1704261,7289.46524 C9.44661654,7289.47024 6.72380952,7289.42627 4,7289.43526 M4,7281.84344 L4,7288.61071 C6.72581454,7288.61771 9.45162907,7288.57673 12.1774436,7288.57973 C12.1754386,7285.96017 12.1754386,7283.34361 12.1724311,7280.72405 C9.44461153,7281.06486 6.71679198,7281.42567 4,7281.84344 M24,7288.47179 C20.3879699,7288.48578 16.7759398,7288.54075 13.1619048,7288.55175 C13.1598997,7285.88921 13.1598997,7283.22967 13.1619048,7280.56914 C16.7689223,7280.01844 20.3839599,7279.50072 23.997995,7279 C24,7282.15826 23.997995,7285.31353 24,7288.47179"></path>
                            </g>
                        </g>
                    </g>
                </svg>
            );
        case Platform.MAC:
            return (
                <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" width="800px" height="800px" viewBox="0 0 20 20" version="1.1" className={cn}>
                    <g>
                        <g id="Dribbble-Light-Preview" transform="translate(-102.000000, -7439.000000)">
                            <g id="icons" transform="translate(56.000000, 160.000000)">
                                <path d="M57.5708873,7282.19296 C58.2999598,7281.34797 58.7914012,7280.17098 58.6569121,7279 C57.6062792,7279.04 56.3352055,7279.67099 55.5818643,7280.51498 C54.905374,7281.26397 54.3148354,7282.46095 54.4735932,7283.60894 C55.6455696,7283.69593 56.8418148,7283.03894 57.5708873,7282.19296 M60.1989864,7289.62485 C60.2283111,7292.65181 62.9696641,7293.65879 63,7293.67179 C62.9777537,7293.74279 62.562152,7295.10677 61.5560117,7296.51675 C60.6853718,7297.73474 59.7823735,7298.94772 58.3596204,7298.97372 C56.9621472,7298.99872 56.5121648,7298.17973 54.9134635,7298.17973 C53.3157735,7298.17973 52.8162425,7298.94772 51.4935978,7298.99872 C50.1203933,7299.04772 49.0738052,7297.68074 48.197098,7296.46676 C46.4032359,7293.98379 45.0330649,7289.44985 46.8734421,7286.3899 C47.7875635,7284.87092 49.4206455,7283.90793 51.1942837,7283.88393 C52.5422083,7283.85893 53.8153044,7284.75292 54.6394294,7284.75292 C55.4635543,7284.75292 57.0106846,7283.67793 58.6366882,7283.83593 C59.3172232,7283.86293 61.2283842,7284.09893 62.4549652,7285.8199 C62.355868,7285.8789 60.1747177,7287.09489 60.1989864,7289.62485"></path>
                            </g>
                        </g>
                    </g>
                </svg>
            );
        case Platform.LINUX:
            return (
                <svg xmlns="http://www.w3.org/2000/svg" className={cn} width="800px" height="800px" viewBox="0 0 20 20"><path d="M20.581 19.049c-.55-.446-.336-1.431-.907-1.917.553-3.365-.997-6.331-2.845-8.232-1.551-1.595-1.051-3.147-1.051-4.49 0-2.146-.881-4.41-3.55-4.41-2.853 0-3.635 2.38-3.663 3.738-.068 3.262.659 4.11-1.25 6.484-2.246 2.793-2.577 5.579-2.07 7.057-.237.276-.557.582-1.155.835-1.652.72-.441 1.925-.898 2.78-.13.243-.192.497-.192.74 0 .75.596 1.399 1.679 1.302 1.461-.13 2.809.905 3.681.905.77 0 1.402-.438 1.696-1.041 1.377-.339 3.077-.296 4.453.059.247.691.917 1.141 1.662 1.141 1.631 0 1.945-1.849 3.816-2.475.674-.225 1.013-.879 1.013-1.488 0-.39-.139-.761-.419-.988zm-9.147-10.465c-.319 0-.583-.258-1-.568-.528-.392-1.065-.618-1.059-1.03 0-.283.379-.37.869-.681.526-.333.731-.671 1.249-.671.53 0 .69.268 1.41.579.708.307 1.201.427 1.201.773 0 .355-.741.609-1.158.868-.613.378-.928.73-1.512.73zm1.665-5.215c.882.141.981 1.691.559 2.454l-.355-.145c.184-.543.181-1.437-.435-1.494-.391-.036-.643.48-.697.922-.153-.064-.32-.11-.523-.127.062-.923.658-1.737 1.451-1.61zm-3.403.331c.676-.168 1.075.618 1.078 1.435l-.31.19c-.042-.343-.195-.897-.579-.779-.411.128-.344 1.083-.115 1.279l-.306.17c-.42-.707-.419-2.133.232-2.295zm-2.115 19.243c-1.963-.893-2.63-.69-3.005-.69-.777 0-1.031-.579-.739-1.127.248-.465.171-.952.11-1.343-.094-.599-.111-.794.478-1.052.815-.346 1.177-.791 1.447-1.124.758-.937 1.523.537 2.15 1.85.407.851 1.208 1.282 1.455 2.225.227.871-.71 1.801-1.896 1.261zm6.987-1.874c-1.384.673-3.147.982-4.466.299-.195-.563-.507-.927-.843-1.293.539-.142.939-.814.46-1.489-.511-.721-1.555-1.224-2.61-2.04-.987-.763-1.299-2.644.045-4.746-.655 1.862-.272 3.578.057 4.069.068-.988.146-2.638 1.496-4.615.681-.998.691-2.316.706-3.14l.62.424c.456.337.838.708 1.386.708.81 0 1.258-.466 1.882-.853.244-.15.613-.302.923-.513.52 2.476 2.674 5.454 2.795 7.15.501-1.032-.142-3.514-.142-3.514.842 1.285.909 2.356.946 3.67.589.241 1.221.869 1.279 1.696l-.245-.028c-.126-.919-2.607-2.269-2.83-.539-1.19.181-.757 2.066-.997 3.288-.11.559-.314 1.001-.462 1.466zm4.846-.041c-.985.38-1.65 1.187-2.107 1.688-.88.966-2.044.503-2.168-.401-.131-.966.36-1.493.572-2.574.193-.987-.023-2.506.431-2.668.295 1.753 2.066 1.016 2.47.538.657 0 .712.222.859.837.092.385.219.709.578 1.09.418.447.29 1.133-.635 1.49zm-8-13.006c-.651 0-1.138-.433-1.534-.769-.203-.171.05-.487.253-.315.387.328.777.675 1.281.675.607 0 1.142-.519 1.867-.805.247-.097.388.285.143.382-.704.277-1.269.832-2.01.832z"/></svg>
            );
    }
};

const MetacriticCircle = ({ score }: { score: number }) => {
    const getColor = (s: number) => {
        if (s >= 75) return "text-green-400";
        if (s >= 50) return "text-yellow-400";
        return "text-red-400";
    };

    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;

    return (
        <div className="relative flex items-center justify-center w-12 h-12 bg-card/90 backdrop-blur-sm rounded-full shadow-lg border border-border">
            <svg className="w-full h-full -rotate-90 transform">
                <circle
                    className="text-zinc-700"
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="24"
                    cy="24"
                />
                <circle
                    className={`${getColor(score)} transition-all duration-500 ease-out`}
                    strokeWidth="4"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="24"
                    cy="24"
                />
            </svg>
            <span className={`absolute text-sm font-bold ${getColor(score)}`}>
        {score}
      </span>
        </div>
    );
};

export function GameDetailCard({ game, children, onRevalidate }: {
    game: GameGetPayload<{ include: { categories: true; genres: true } }>;
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
                className="w-125 p-0 overflow-hidden border-border bg-card text-card-foreground shadow-2xl pointer-events-none"
                onPointerLeave={(e) => {
                  if (dropdownOpen) e.preventDefault();
                }}
                ref={(node) => {
                    if (node?.parentElement) {
                        node.parentElement.style.pointerEvents = "none";
                    }
                }}
            >
                <div className="relative w-full h-40 bg-background group">
                    <div className="absolute inset-0 transform group-hover:scale-105 transition-transform duration-300 ease-out">
                        <SafeImage
                            srcs={[
                                `https://steamcdn-a.akamaihd.net/steam/apps/${game.appId}/header.jpg`,
                                `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appId}/library_hero.jpg`,
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
                                    <Gem className="w-4 h-4 inline-block mr-1.5 text-blue-400 opacity-80" />
                                )}
                                {game.name}
                            </h3>
                            <div className="flex items-center text-xs text-muted-foreground mt-1">
                                <CalendarDays className="w-3 h-3 mr-1.5 opacity-70" />
                                {game.releaseDate
                                    ? new Date(game.releaseDate).toLocaleDateString(undefined, {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                    })
                                    : "TBA"}
                            </div>
                        </div>

                        {game.metacriticScore && (
                            <div className="mb-1 shrink-0">
                                <MetacriticCircle score={game.metacriticScore} />
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
                                <div className="flex flex-wrap gap-1.5">
                                    {game.genres.length === 0 ? (
                                        <span className="text-xs text-muted-foreground leading-snug">
                                          N/A
                                        </span>
                                    ) : (
                                        <ExpandablePills items={game.genres} max={3} />
                                    )}
                                </div>
                            </div>

                            <Separator className="bg-border my-2" />

                            <div>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 block mb-1">
                                  Categories
                                </span>

                                {game.genres.length === 0 ? (
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