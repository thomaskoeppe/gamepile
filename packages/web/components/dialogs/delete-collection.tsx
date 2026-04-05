import { LoaderCircle, Trash2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { ReactNode, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { browserLog } from "@/lib/browser-logger";
import { deleteCollection } from "@/server/actions/collections";

export function DeleteCollectionDialog({
    collectionId,
    collectionName,
    children,
    onDeleted,
}: {
    collectionId: string;
    collectionName: string;
    children: ReactNode;
    onDeleted?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const { executeAsync, isPending } = useAction(deleteCollection);

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next);
        if (!next) setServerError(null);
    }, []);

    const handleDelete = useCallback(async () => {
        browserLog.warn('Delete collection confirmed', { collectionId, collectionName });
        const result = await executeAsync({ collectionId });

        if (result?.data?.success) {
            browserLog.info('Collection deleted', { collectionId, collectionName });
            setOpen(false);
            onDeleted?.();
        } else {
            browserLog.error('Delete collection failed', new Error(result?.serverError ?? 'Unknown error'), { collectionId });
            setServerError(result?.serverError ?? "An unexpected error occurred.");
        }
    }, [executeAsync, collectionId, collectionName, onDeleted]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent className="outline-none">
                <DialogHeader>
                    <DialogTitle>Delete Collection</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete <strong>{collectionName}</strong>? This action cannot be undone.
                        All games in this collection will be removed from it.
                    </DialogDescription>
                </DialogHeader>

                {serverError && (
                    <p className="text-sm text-destructive">{serverError}</p>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="button" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" onClick={handleDelete} disabled={isPending}>
                        {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        Delete Collection
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
