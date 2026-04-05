import { LoaderCircle, Trash2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { ReactNode, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { browserLog } from "@/lib/browser-logger";
import { deleteVault } from "@/server/actions/vaults/manage";

export function DeleteVaultDialog({
    vaultId,
    vaultName,
    children,
    onDeleted,
}: {
    vaultId: string;
    vaultName: string;
    children: ReactNode;
    onDeleted?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const { executeAsync, isPending } = useAction(deleteVault);

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next);
        if (!next) setServerError(null);
    }, []);

    const handleDelete = useCallback(async () => {
        browserLog.warn('Delete vault confirmed', { vaultId, vaultName });
        const result = await executeAsync({ vaultId });

        if (result?.data?.success) {
            browserLog.info('Vault deleted', { vaultId, vaultName });
            setOpen(false);
            onDeleted?.();
        } else {
            browserLog.error('Delete vault failed', new Error(result?.serverError ?? 'Unknown error'), { vaultId });
            setServerError(result?.serverError ?? "An unexpected error occurred.");
        }
    }, [executeAsync, vaultId, vaultName, onDeleted]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent className="outline-none">
                <DialogHeader>
                    <DialogTitle>Delete Vault</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete <strong>{vaultName}</strong>? This action cannot be undone.
                        All keys stored in this vault will be permanently deleted.
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
                        Delete Vault
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
