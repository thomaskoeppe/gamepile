import { Check, FolderPlus, Library, Plus } from "lucide-react";
import { useOptimisticAction } from "next-safe-action/hooks";
import { ReactNode, useCallback, useState } from "react";
import { preload } from "swr";

import { CreateCollectionDialog } from "@/components/dialogs/create-collection";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { browserLog } from "@/lib/browser-logger";
import {useServerQuery} from "@/lib/hooks/use-server-query";
import { useNotifications } from "@/lib/providers/notifications";
import { cn } from "@/lib/utils";
import {toggleGameInCollection} from "@/server/actions/collection-games";
import {getCollectionsForGame} from "@/server/queries/collection-games";

export function AddToCollectionDropdown({
    gameId,
    children,
    className,
    side = "bottom",
    align = "end",
    onOpenChange,
    onRevalidate
}: {
    gameId: string;
    children?: ReactNode;
    className?: string;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    onOpenChange?: (open: boolean) => void;
    onRevalidate?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const { notify } = useNotifications();

    const {
        data: collectionsResult,
        isLoading,
        mutate,
    } = useServerQuery(
        open ? ["collections-for-game", gameId] : null,
        () => getCollectionsForGame({ gameId })
    );

    const serverCollections: Array<{ id: string; name: string; isMember: boolean; }> =
        collectionsResult?.success ? collectionsResult.data : [];

    const { execute: toggleCollection, optimisticState: collections, isPending, input } = useOptimisticAction(
        toggleGameInCollection,
        {
            currentState: serverCollections,
            updateFn: (state, { collectionId }) =>
                state.map((c) => c.id === collectionId ? { ...c, isMember: !c.isMember } : c),
            onSuccess: ({ input }) => {
                browserLog.info(input.isMember ? 'Game removed from collection' : 'Game added to collection', { gameId, collectionId: input.collectionId });
                void mutate();
                onRevalidate?.();
                notify({
                    type: "success",
                    title: input.isMember ? "Removed from collection" : "Added to collection",
                    message: input.isMember
                        ? "The game was removed from the selected collection."
                        : "The game was added to the selected collection.",
                });
            },
            onError: () => {
                browserLog.error('Collection toggle failed', new Error('Toggle game in collection failed'), { gameId });
                void mutate();
                notify({
                    type: "error",
                    title: "Collection update failed",
                    message: "An error occurred while updating the collection. Please try again.",
                });
            },
        }
    );

    const handlePrefetch = useCallback(() => {
        preload(["collections-for-game", gameId], () => getCollectionsForGame({ gameId }));
    }, [gameId]);

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) void mutate();
        onOpenChange?.(nextOpen);
    }, [mutate, onOpenChange]);

    const handleNewCollection = useCallback(() => {
        void mutate();
    }, [mutate]);

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger
                asChild
                onMouseEnter={handlePrefetch}
                onFocus={handlePrefetch}
            >
                {children ?? (
                    <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                            "size-8 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                            className
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Plus className="size-4" />
                    </Button>
                )}
            </PopoverTrigger>

            <PopoverContent
                side={side}
                align={align}
                className="w-72 p-0 bg-card border-border text-card-foreground"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                    <Library className="size-4 text-muted-foreground" />
                    <span className="text-xs font-medium">Add to Collection</span>
                </div>

                <div className="p-3">
                    {isLoading && (
                        <div className="flex items-center justify-center py-6">
                            <Spinner className="size-5 text-muted-foreground" />
                        </div>
                    )}

                    {!isLoading && collections.length === 0 && (
                        <div className="py-6 text-center">
                            <p className="text-xs text-muted-foreground">No collections yet.</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">Create one to get started.</p>
                        </div>
                    )}

                    {!isLoading && collections.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {collections.map((collection) => (
                                <div key={collection.id}>
                                    {isPending && input?.collectionId === collection.id ? (
                                        <button
                                            key={collection.id}
                                            disabled={true}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                                                "border focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:ring-offset-card",
                                                "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:border-border"
                                            )}
                                        >
                                            <Spinner className="size-3 text-muted-foreground" />
                                            <span className="truncate max-w-30">{collection.name}</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => toggleCollection({
                                                collectionId: collection.id,
                                                gameId,
                                                isMember: collection.isMember,
                                            })}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                                                "border focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:ring-offset-card",
                                                collection.isMember
                                                    ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                                                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:border-border",
                                            )}
                                        >
                                            {collection.isMember && <Check className="size-3" />}
                                            <span className="truncate max-w-30">{collection.name}</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-t border-border p-2">
                    <CreateCollectionDialog onSuccess={handleNewCollection}>
                        <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                            <FolderPlus className="size-4" />
                            <span>Create new collection</span>
                        </button>
                    </CreateCollectionDialog>
                </div>
            </PopoverContent>
        </Popover>
    );
}