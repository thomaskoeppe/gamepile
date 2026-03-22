import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Pencil } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { ReactNode, useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { browserLog } from "@/lib/browser-logger";
import { renameVault } from "@/server/actions/vaults";

const schema = z.object({
    name: z.string().min(5).max(25),
});

type FormValues = z.infer<typeof schema>;

export function RenameVaultDialog({
    vaultId,
    currentName,
    children,
    onReload,
}: {
    vaultId: string;
    currentName: string;
    children: ReactNode;
    onReload?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: currentName },
    });

    const { executeAsync, isPending } = useAction(renameVault);

    const resetDialog = useCallback(() => {
        setServerError(null);
        form.reset({ name: currentName });
    }, [form, currentName]);

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next);
        if (!next) resetDialog();
    }, [resetDialog]);

    const handleSubmit = useCallback(async () => {
        const valid = await form.trigger();
        if (!valid) return;

        browserLog.info('Rename vault submitted', { vaultId, name: form.getValues().name });
        const result = await executeAsync({ vaultId, name: form.getValues().name });

        if (result?.data?.success) {
            browserLog.info('Vault renamed', { vaultId, name: form.getValues().name });
            onReload?.();
            setOpen(false);
            setTimeout(resetDialog, 300);
        } else {
            browserLog.error('Rename vault failed', new Error(result?.serverError ?? 'Unknown error'), { vaultId });
            setServerError(result?.serverError ?? "An unexpected error occurred.");
        }
    }, [form, executeAsync, vaultId, onReload, resetDialog]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent className="outline-none">
                <DialogHeader>
                    <DialogTitle>Rename Vault</DialogTitle>
                    <DialogDescription>Enter a new name for your vault.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <FieldGroup>
                        <Controller name="name" control={form.control} render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor="rename-vault-name">Vault Name</FieldLabel>
                                <Input
                                    {...field}
                                    id="rename-vault-name"
                                    placeholder="My Game Keys"
                                    autoComplete="off"
                                    autoFocus
                                />
                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                            </Field>
                        )} />
                    </FieldGroup>

                    {serverError && (
                        <p className="text-sm text-destructive">{serverError}</p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleSubmit} disabled={isPending}>
                            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Pencil className="size-4" />}
                            Rename
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
