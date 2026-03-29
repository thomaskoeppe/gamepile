"use client";

import { ColumnDef } from "@tanstack/table-core";
import {
    AlertCircle, Eye, MoreVertical, TicketCheck, Undo2,
} from "lucide-react";

import { GameDetailCard } from "@/components/game/game-detail-card";
import { SafeImage } from "@/components/safe-image";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { KeyVaultGameGetPayload } from "@/prisma/generated/models/KeyVaultGame";

export type VaultGameRow = KeyVaultGameGetPayload<{
    include: {
        game: { include: { categories: true; genres: true } };
        addedBy: true;
        redeemedBy: true;
    };
}> & { isOwned: boolean; isInMultipleVaults: boolean };

interface CreateColumnsOptions {
    canRedeem: boolean;
    openKeyDialog: (game: VaultGameRow) => void;
    onUnredeem: (vaultGameId: string) => void;
}

export function createVaultKeyColumns({
                                          canRedeem,
                                          openKeyDialog,
                                          onUnredeem,
                                      }: CreateColumnsOptions): ColumnDef<VaultGameRow>[] {
    return [
        {
            accessorKey: "image",
            enableSorting: false,
            header: "",
            cell: ({ row }) =>
                row.original.game ? (
                    <GameDetailCard game={row.original.game}>
                        <SafeImage
                            srcs={[
                                `https://steamcdn-a.akamaihd.net/steam/apps/${row.original.game.appId}/header.jpg`,
                                `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${row.original.game.appId}/library_hero.jpg`,
                            ]}
                            alt={row.original.game.name}
                            className="w-32 h-9 object-cover rounded-md"
                            width={128}
                            height={36}
                        />
                    </GameDetailCard>
                ) : (
                    <div className="w-32 h-9 bg-muted rounded-md" />
                ),
        },
        {
            accessorKey: "game.appId",
            header: "App ID",
            cell: ({ row }) => (
                <span className="font-mono text-sm">
                    {row.original.game?.appId ?? <span className="text-muted-foreground/70 italic">N/A</span>}
                </span>
            ),
        },
        {
            accessorKey: "game.name",
            header: "Game Name",
            cell: ({ row }) => {
                const name = row.original.game?.name ?? row.original.originalName ?? "Unknown Game";
                return (
                    <span className="inline-flex items-center">
                        <span className={cn("mr-2 text-sm", row.original.isOwned ? "text-muted-foreground" : "text-green-500")}>●</span>
                        <span>{name}</span>
                        {row.original.isInMultipleVaults && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="ml-2 text-yellow-500"><AlertCircle className="w-4 h-4" /></span>
                                </TooltipTrigger>
                                <TooltipContent>This game key exists in multiple vaults</TooltipContent>
                            </Tooltip>
                        )}
                    </span>
                );
            },
        },
        {
            accessorKey: "addedBy",
            enableSorting: false,
            header: "Added By",
            cell: ({ row }) => (
                <span>
                    {row.original.addedBy?.username ?? "Unknown User"} at{" "}
                    {new Date(row.original.addedAt).toLocaleDateString()}
                </span>
            ),
        },
        {
            accessorKey: "redeemed",
            enableSorting: false,
            header: "Redeemed by",
            cell: ({ row }) =>
                !row.original.redeemed ? (
                    <span className="text-muted-foreground/70 italic">Not Redeemed</span>
                ) : (
                    <span>
                        Redeemed by {row.original.redeemedBy?.username ?? "Unknown User"} at{" "}
                        {new Date(row.original.redeemedAt!).toLocaleDateString()}
                    </span>
                ),
        },
        {
            accessorKey: "actions",
            header: "",
            enableSorting: false,
            enableResizing: false,
            size: 10,
            cell: ({ row }) => {
                const hasDropdownItems = canRedeem;

                return (
                    <div className="flex gap-2 justify-end">
                        {canRedeem && (
                            <Button
                                variant="ghost"
                                className="hover:text-primary hover:bg-muted/50"
                                onClick={() => openKeyDialog(row.original)}
                            >
                                {row.original.redeemed
                                    ? <><Eye className="w-4 h-4" /> Show Key</>
                                    : <><TicketCheck className="w-4 h-4" /> Redeem</>
                                }
                            </Button>
                        )}

                        {hasDropdownItems && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="hover:text-primary hover:bg-muted/50">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openKeyDialog(row.original)}>
                                        {row.original.redeemed
                                            ? <><Eye className="w-4 h-4 mr-2" /> Show Key</>
                                            : <><TicketCheck className="w-4 h-4 mr-2" /> Redeem Key</>
                                        }
                                    </DropdownMenuItem>
                                    {row.original.redeemed && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => onUnredeem(row.original.id)}>
                                                <Undo2 className="w-4 h-4 mr-2" /> Mark as Unredeemed
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                );
            },
        },
    ];
}

