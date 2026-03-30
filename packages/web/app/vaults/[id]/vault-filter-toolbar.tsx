"use client";

import {Eraser, RefreshCw, Search, TicketCheck} from "lucide-react";

import { KeyImport } from "@/app/vaults/[id]/key-import";
import { MultiSelectCombobox } from "@/components/multi-select-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { KeyVaultAuthType } from "@/prisma/generated/browser";

interface VaultFilterToolbarProps {
    filters: { name: string; tags: string[]; isOwned: boolean | null; isRedeemed: boolean | null };
    genres: string[];
    categories: string[];
    onNameChange: (name: string) => void;
    onTagsChange: (tags: string[]) => void;
    onOwnedChange: (value: boolean | null) => void;
    onRedeemedChange: (value: boolean | null) => void;
    onClearFilters: () => void;
    onRefresh: () => void;
    isLoading: boolean;
    keyVaultId: string;
    canCreate: boolean;
    keyVaultAuthType: KeyVaultAuthType;
    onImportRefresh: () => void;
    canRedeem: boolean;
    openMultiKeyRedeemDialog: () => void;
    showMultiKeyRedeemDialogTrigger: boolean;
}

export function VaultFilterToolbar({
    filters,
    genres,
    categories,
    onNameChange,
    onTagsChange,
    onOwnedChange,
    onRedeemedChange,
    onClearFilters,
    onRefresh,
    isLoading,
    keyVaultId,
    canCreate,
    keyVaultAuthType,
    onImportRefresh,
    canRedeem,
    openMultiKeyRedeemDialog,
    showMultiKeyRedeemDialogTrigger,
}: VaultFilterToolbarProps) {
    return (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 gap-2">
                <div className="relative flex-1 group">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                        placeholder="Filter by name..."
                        value={filters.name}
                        onChange={(e) => onNameChange(e.target.value)}
                        className="pl-8 bg-card/50 border-border focus-visible:border-primary"
                    />
                </div>

                <div className="relative flex-1">
                    <MultiSelectCombobox
                        options={[
                            ...genres.map((g) => ({ label: g, value: `genre_${g}`, category: "genre" })),
                            ...categories.map((c) => ({ label: c, value: `category_${c}`, category: "category" })),
                        ]}
                        selected={filters.tags}
                        onChange={onTagsChange}
                        placeholder="Filter by tags..."
                        className="w-full"
                    />
                </div>

                <Select
                    value={filters.isOwned === null ? "all" : filters.isOwned ? "owned" : "unowned"}
                    onValueChange={(value) => {
                        onOwnedChange(value === "all" ? null : value === "owned");
                    }}
                >
                    <SelectTrigger className="w-42">
                        <SelectValue placeholder="All Games" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Games</SelectItem>
                        <SelectItem value="owned">Only Owned</SelectItem>
                        <SelectItem value="unowned">Only Unowned</SelectItem>
                    </SelectContent>
                </Select>

                <Select
                    value={filters.isRedeemed === null ? "all" : filters.isRedeemed ? "redeemed" : "unredeemed"}
                    onValueChange={(value) => {
                        onRedeemedChange(value === "all" ? null : value === "redeemed");
                    }}
                >
                    <SelectTrigger className="w-46">
                        <SelectValue placeholder="All Keys" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Keys</SelectItem>
                        <SelectItem value="unredeemed">Only Unredeemed</SelectItem>
                        <SelectItem value="redeemed">Only Redeemed</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex gap-2">
                <KeyImport
                    keyVaultId={keyVaultId}
                    disabled={!canCreate}
                    onRefresh={onImportRefresh}
                    keyVaultAuthType={keyVaultAuthType}
                />

                <Button
                    variant="outline"
                    size="icon"
                    className="border-border hover:bg-card hover:border-primary transition-all bg-transparent"
                    onClick={onClearFilters}
                >
                    <Eraser className="h-4 w-4" />
                </Button>

                <Button
                    variant="outline"
                    size="icon"
                    className="border-border hover:bg-card hover:border-primary transition-all bg-transparent"
                    onClick={onRefresh}
                    disabled={isLoading}
                >
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                </Button>

                {showMultiKeyRedeemDialogTrigger && (
                    <Button
                        onClick={() => openMultiKeyRedeemDialog()}
                    >
                        <TicketCheck className="h-4 w-4" />
                        Redeem Selected
                    </Button>
                )}
            </div>
        </div>
    );
}

