"use client";

import { ColumnDef } from "@tanstack/table-core";
import {
    AlertCircle, Eye, MoreVertical, TicketCheck, Undo2,
} from "lucide-react";

import { GameDetailCard } from "@/components/game/game-detail-card";
import { SafeImage } from "@/components/shared/safe-image";
import { Button } from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KeyVaultGameGetPayload } from "@/prisma/generated/models/KeyVaultGame";

export type VaultGameRow = KeyVaultGameGetPayload<{
    include: {
        game: { include: { categories: true; genres: true } };
        addedBy: { select: { id: true; username: true; avatarUrl: true } };
        redeemedBy: { select: { id: true; username: true; avatarUrl: true } };
    };
}> & { isOwned: boolean; isInMultipleVaults: boolean };

interface CreateColumnsOptions {
    canRedeem: boolean;
    openKeyDialog: (game: VaultGameRow) => void;
    onUnredeem: (vaultGameId: string) => void;
    selectedVaultGameIds: string[];
    onToggleSelect: (vaultGameId: string, checked: boolean) => void;
    onToggleSelectPage: (checked: boolean) => void;
    allPageRowsSelected: boolean;
    somePageRowsSelected: boolean;
}

export function createVaultKeyColumns({
  canRedeem,
  openKeyDialog,
  onUnredeem,
  selectedVaultGameIds,
  onToggleSelect,
  onToggleSelectPage,
  allPageRowsSelected,
  somePageRowsSelected,
}: CreateColumnsOptions): ColumnDef<VaultGameRow>[] {
    const selectionColumn: ColumnDef<VaultGameRow> = {
        id: "select",
        enableSorting: false,
        header: () => (
            <Checkbox
                checked={allPageRowsSelected ? allPageRowsSelected : !allPageRowsSelected && somePageRowsSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => onToggleSelectPage(checked as boolean)}
                disabled={!canRedeem}
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={selectedVaultGameIds.includes(row.original.id)}
                onCheckedChange={(checked) => onToggleSelect(row.original.id, checked as boolean)}
                disabled={!canRedeem || row.original.redeemed}
            />
        ),
        size: 24,
    };

    return [
        ...(canRedeem ? [selectionColumn] : []),
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
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span><span className={row.original.isOwned ? "text-muted-foreground" : "text-green-500"}>●</span> {name}</span>
                            </TooltipTrigger>
                            <TooltipContent>{row.original.isOwned ? "You already own this game" : "This game is not in your library"}</TooltipContent>
                        </Tooltip>

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

                        {canRedeem && (
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
