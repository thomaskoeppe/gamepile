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
import { InputGroup, InputGroupAddon, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group";
import { browserLog } from "@/lib/browser-logger";
import { renameCollection } from "@/server/actions/collections";

const schema = z.object({
    name: z.string().min(5).max(25),
    description: z.string().min(20).max(100).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export function RenameCollectionDialog({
    collectionId,
    currentName,
    currentDescription,
    children,
    onReload,
}: {
    collectionId: string;
    currentName: string;
    currentDescription?: string;
    children: ReactNode;
    onReload?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: currentName, description: currentDescription ?? "" },
    });

    const { executeAsync, isPending } = useAction(renameCollection);

    const resetDialog = useCallback(() => {
        setServerError(null);
        form.reset({ name: currentName, description: currentDescription ?? "" });
    }, [form, currentName, currentDescription]);

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next);
        if (!next) resetDialog();
    }, [resetDialog]);

    const handleSubmit = useCallback(async () => {
        const valid = await form.trigger();
        if (!valid) return;

        const values = form.getValues();
        browserLog.info('Rename collection submitted', { collectionId, name: values.name });
        const result = await executeAsync({
            collectionId,
            name: values.name,
            description: values.description || undefined,
        });

        if (result?.data?.success) {
            browserLog.info('Collection renamed', { collectionId, name: values.name });
            onReload?.();
            setOpen(false);
            setTimeout(resetDialog, 300);
        } else {
            browserLog.error('Rename collection failed', new Error(result?.serverError ?? 'Unknown error'), { collectionId });
            setServerError(result?.serverError ?? "An unexpected error occurred.");
        }
    }, [form, executeAsync, collectionId, onReload, resetDialog]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent className="outline-none">
                <DialogHeader>
                    <DialogTitle>Rename Collection</DialogTitle>
                    <DialogDescription>Update the name and description of your collection.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <FieldGroup>
                        <Controller name="name" control={form.control} render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor="rename-collection-name">Name</FieldLabel>
                                <Input
                                    {...field}
                                    id="rename-collection-name"
                                    placeholder="My Collection"
                                    autoComplete="off"
                                    autoFocus
                                />
                                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                            </Field>
                        )} />

                        <Controller name="description" control={form.control} render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor="rename-collection-description">Description</FieldLabel>
                                <InputGroup>
                                    <InputGroupTextarea
                                        {...field}
                                        id="rename-collection-description"
                                        placeholder="Describe this collection..."
                                        autoComplete="off"
                                        rows={4}
                                        className="min-h-20 resize-none"
                                        aria-invalid={fieldState.invalid}
                                    />
                                    <InputGroupAddon align="block-end">
                                        <InputGroupText className="tabular-nums">
                                            {field.value?.length ?? 0} / 100
                                        </InputGroupText>
                                    </InputGroupAddon>
                                </InputGroup>
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
                            Save Changes
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
