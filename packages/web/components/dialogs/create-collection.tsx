import { zodResolver } from "@hookform/resolvers/zod";
import {
    CheckCircle2, ChevronRight, Globe, Library, LoaderCircle,
    Lock, ShieldAlert, Users,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { KeyboardEvent,ReactNode, useCallback, useState } from "react";
import {Controller, useForm, useWatch} from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { browserLog } from "@/lib/browser-logger";
import { cn } from "@/lib/utils";
import { CollectionVisibility } from "@/prisma/generated/enums";
import { createCollection } from "@/server/actions/collections";

const schema = z.object({
    name: z.string().min(5).max(25),
    description: z.string().min(20).max(100),
    type: z.enum(CollectionVisibility)
});

type FormValues = z.infer<typeof schema>;

const STEPS = ["Details", "Visibility"] as const;
type Step = 1 | 2 | 3;

function StepIndicator({ current }: { current: Step }) {
    return (
        <div className="flex items-center gap-2 mb-1">
            {STEPS.map((label, i) => {
                const step = (i + 1) as Step;
                const done = current > step;
                const active = current === step;
                return (
                    <div key={label} className="flex items-center gap-2">
                        <div className={cn(
                            "flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors select-none",
                            done && "bg-primary text-primary-foreground",
                            active && "bg-primary/20 text-primary border border-primary",
                            !done && !active && "bg-muted text-muted-foreground",
                        )}>
                            {done ? <CheckCircle2 className="size-3.5" /> : step}
                        </div>
                        <span className={cn(
                            "text-xs select-none",
                            active ? "text-foreground font-medium" : "text-muted-foreground",
                        )}>
                            {label}
                        </span>
                        {i < STEPS.length - 1 && (
                            <ChevronRight className="size-3 text-muted-foreground/40 mx-0.5" />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

const visibilityIcon = {
    [CollectionVisibility.PRIVATE]: <Lock className="size-4 text-muted-foreground" />,
    [CollectionVisibility.PUBLIC]: <Globe className="size-4 text-muted-foreground" />,
};

export function CreateCollectionDialog({
    children,
    onReload,
    onSuccess
}: {
    children: ReactNode;
    onReload?: () => void;
    onSuccess?: (data: { id: string; name: string }) => void;
}) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<Step>(1);
    const [serverError, setServerError] = useState<string | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: "",
            description: "",
            type: CollectionVisibility.PRIVATE,
        },
    });

    const type = useWatch({ control: form.control, name: "type" });

    const { executeAsync, isPending } = useAction(createCollection);

    const resetDialog = useCallback(() => {
        setStep(1);
        setServerError(null);
        form.reset();
    }, [form]);

    const handleOpenChange = useCallback((next: boolean) => {
        browserLog.info(next ? 'Create collection dialog opened' : 'Create collection dialog closed', { component: 'CreateCollectionDialog' });
        setOpen(next);
        if (!next) resetDialog();
    }, [resetDialog]);

    const handleStep1Continue = useCallback(async () => {
        const valid = await form.trigger(["name", "description"]);
        if (valid) {
            browserLog.debug('Create collection step 1 completed', { name: form.getValues().name });
            setStep(2);
        }
    }, [form]);

    const handleStep2Submit = useCallback(async () => {
        const valid = await form.trigger(["type"]);
        if (!valid) return;

        browserLog.info('Create collection submitted', { name: form.getValues().name, type: form.getValues().type });
        const result = await executeAsync(form.getValues());

        if (result?.data?.success && result.data.data) {
            browserLog.info('Collection created', { collectionId: result.data.data.id, name: result.data.data.name });
            onReload?.();
            onSuccess?.(result.data.data);
            setOpen(false);
            setTimeout(resetDialog, 300);
        } else {
            const errorMsg = result?.data?.message ?? result?.serverError ?? "An unexpected error occurred.";
            browserLog.error('Create collection failed', new Error(errorMsg), { component: 'CreateCollectionDialog' });
            setServerError(errorMsg);
            setStep(3);
        }
    }, [form, executeAsync, onReload, onSuccess, resetDialog]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key !== "Enter" || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();

        if (step === 1) void handleStep1Continue();
        if (step === 2) void handleStep2Submit();
    }, [step, handleStep1Continue, handleStep2Submit]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent className="outline-none" onKeyDown={handleKeyDown}>
                <DialogHeader>
                    <DialogTitle>Create Collection</DialogTitle>
                    <DialogDescription>Create a new collection to organize your games</DialogDescription>
                </DialogHeader>

                {step !== 3 && <StepIndicator current={step} />}

                {step === 1 && (
                    <div className="space-y-4">
                        <FieldGroup>
                            <Controller name="name" control={form.control} render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor="create-collection-form-name">Name</FieldLabel>
                                    <Input
                                        {...field}
                                        id="create-collection-form-name"
                                        placeholder="My Collection"
                                        autoComplete="off"
                                        autoFocus
                                    />
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )} />

                            <Controller name="description" control={form.control} render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor="create-collection-form-description">Description</FieldLabel>
                                    <InputGroup>
                                        <InputGroupTextarea
                                            {...field}
                                            id="create-collection-form-description"
                                            placeholder="This collection contains my favorite games"
                                            autoComplete="off"
                                            rows={6}
                                            className="min-h-24 resize-none"
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

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleStep1Continue}>
                                Continue
                                <ChevronRight className="size-4" />
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <FieldGroup>
                            <Controller name="type" control={form.control} render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid} orientation="responsive">
                                    <FieldContent>
                                        <FieldLabel htmlFor="create-collection-form-type">Visibility</FieldLabel>
                                        <FieldDescription>Controls who can see this collection</FieldDescription>
                                    </FieldContent>
                                    <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger id="create-collection-form-type" className="min-w-32" aria-invalid={fieldState.invalid}>
                                            <div className="flex items-center gap-2">
                                                {visibilityIcon[field.value as CollectionVisibility]}
                                                <SelectValue placeholder="Select" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent position="item-aligned">
                                            <SelectItem value={CollectionVisibility.PRIVATE}>Private</SelectItem>
                                            <SelectItem value={CollectionVisibility.PUBLIC}>Public</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                            )} />

                            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                                {type === CollectionVisibility.PRIVATE
                                    ? "Only you can see and manage this collection."
                                    : "Anyone can view this collection."}
                            </div>
                        </FieldGroup>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setStep(1)}>
                                Back
                            </Button>
                            <Button type="button" onClick={handleStep2Submit} disabled={isPending}>
                                {isPending
                                    ? <LoaderCircle className="size-4 animate-spin" />
                                    : <Library className="size-4" />
                                }
                                Create Collection
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                                <ShieldAlert className="size-6 text-destructive" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Failed to create collection</p>
                                <p className="text-sm text-muted-foreground mt-1">{serverError}</p>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setStep(2)}>
                                Back
                            </Button>
                            <Button type="button" onClick={() => setOpen(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}