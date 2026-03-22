import { zodResolver } from "@hookform/resolvers/zod";
import {
    CheckCircle2, ChevronRight, LoaderCircle,
    Lock, LockKeyhole, LockOpen, ShieldAlert, Vault,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { KeyboardEvent,ReactNode, useCallback, useEffect, useState } from "react";
import {Controller, useForm, useWatch} from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { browserLog } from "@/lib/browser-logger";
import { cn } from "@/lib/utils";
import { KeyVaultAuthType } from "@/prisma/generated/enums";
import { createVault } from "@/server/actions/vaults";

const schema = z.object({
    name: z.string().min(5).max(25),
    authType: z.enum(KeyVaultAuthType),
    pin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric").optional(),
    password: z.string().min(8).optional(),
}).superRefine((data, ctx) => {
    if (data.authType === KeyVaultAuthType.PIN && !data.pin) {
        ctx.addIssue({ path: ["pin"], message: "PIN is required.", code: "custom" });
    }
    if (data.authType === KeyVaultAuthType.PASSWORD && !data.password) {
        ctx.addIssue({ path: ["password"], message: "Password is required.", code: "custom" });
    }
});

type FormValues = z.infer<typeof schema>;

const STEPS = ["Details", "Security"] as const;
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
                            done   && "bg-primary text-primary-foreground",
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

export function CreateVaultDialog({
                                      children,
                                      onReload,
                                  }: {
    children: ReactNode;
    onReload?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<Step>(1);
    const [serverError, setServerError] = useState<string | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: "",
            authType: KeyVaultAuthType.NONE,
            pin: undefined,
            password: undefined,
        },
    });

    const authType = useWatch({ control: form.control, name: "authType" });

    const { executeAsync, isPending } = useAction(createVault);

    const resetDialog = useCallback(() => {
        setStep(1);
        setServerError(null);
        form.reset();
    }, [form]);

    const handleOpenChange = useCallback((next: boolean) => {
        browserLog.info(next ? 'Create vault dialog opened' : 'Create vault dialog closed', { component: 'CreateVaultDialog' });
        setOpen(next);
        if (!next) resetDialog();
    }, [resetDialog]);

    useEffect(() => {
        if (authType !== KeyVaultAuthType.PIN) {
            form.setValue("pin", undefined);
            form.clearErrors("pin");
        }
        if (authType !== KeyVaultAuthType.PASSWORD) {
            form.setValue("password", undefined);
            form.clearErrors("password");
        }
    }, [authType, form]);

    const handleStep1Continue = useCallback(async () => {
        const valid = await form.trigger("name");
        if (valid) setStep(2);
    }, [form]);

    const handleStep2Submit = useCallback(async () => {
        const fields: (keyof FormValues)[] =
            authType === KeyVaultAuthType.PIN      ? ["authType", "pin"] :
                authType === KeyVaultAuthType.PASSWORD ? ["authType", "password"] :
                    ["authType"];

        const valid = await form.trigger(fields);
        if (!valid) return;

        browserLog.info('Create vault submitted', { name: form.getValues().name, authType });
        const result = await executeAsync(form.getValues());

        if (result?.data?.id) {
            browserLog.info('Vault created', { vaultId: result.data.id });
            onReload?.();
            setOpen(false);
            setTimeout(resetDialog, 300);
        } else {
            browserLog.error('Create vault failed', new Error(result?.serverError ?? 'Unknown error'), { component: 'CreateVaultDialog' });
            setServerError(result?.serverError ?? "An unexpected error occurred.");
            setStep(3);
        }
    }, [authType, form, executeAsync, onReload, resetDialog]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key !== "Enter" || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();

        if (step === 1) void handleStep1Continue();
        if (step === 2) void handleStep2Submit();
    }, [step, handleStep1Continue, handleStep2Submit]);

    const authTypeIcon = {
        [KeyVaultAuthType.NONE]: <LockOpen className="size-4 text-muted-foreground" />,
        [KeyVaultAuthType.PIN]: <LockKeyhole className="size-4 text-muted-foreground" />,
        [KeyVaultAuthType.PASSWORD]: <Lock className="size-4 text-muted-foreground" />,
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent className="outline-none" onKeyDown={handleKeyDown}>
                <DialogHeader>
                    <DialogTitle>Create Vault</DialogTitle>
                    <DialogDescription>Secure vault for storing your game keys</DialogDescription>
                </DialogHeader>

                {/* Only show step indicator on steps 1 & 2 */}
                {step !== 3 && <StepIndicator current={step} />}

                {/* Step 1 — Name */}
                {step === 1 && (
                    <div className="space-y-4">
                        <FieldGroup>
                            <Controller name="name" control={form.control} render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel htmlFor="create-vault-name">Vault Name</FieldLabel>
                                    <Input
                                        {...field}
                                        id="create-vault-name"
                                        placeholder="My Game Keys"
                                        autoComplete="off"
                                        autoFocus
                                    />
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

                {/* Step 2 — Auth */}
                {step === 2 && (
                    <div className="space-y-4">
                        <FieldGroup>
                            <Controller name="authType" control={form.control} render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid} orientation="responsive">
                                    <FieldContent>
                                        <FieldLabel htmlFor="create-vault-auth-type">Authentication</FieldLabel>
                                        <FieldDescription>Controls how the vault is protected</FieldDescription>
                                    </FieldContent>
                                    <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger id="create-vault-auth-type" className="min-w-32" aria-invalid={fieldState.invalid}>
                                            <div className="flex items-center gap-2">
                                                {authTypeIcon[field.value as KeyVaultAuthType]}
                                                <SelectValue placeholder="Select" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent position="item-aligned">
                                            <SelectItem value={KeyVaultAuthType.NONE}>None</SelectItem>
                                            <SelectItem value={KeyVaultAuthType.PIN}>PIN Code</SelectItem>
                                            <SelectItem value={KeyVaultAuthType.PASSWORD}>Password</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                            )} />

                            {authType === KeyVaultAuthType.PIN && (
                                <Controller name="pin" control={form.control} render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="create-vault-pin">PIN Code</FieldLabel>
                                        <FieldDescription>4–6 digit numeric PIN</FieldDescription>
                                        <Input
                                            {...field}
                                            id="create-vault-pin"
                                            placeholder="1234"
                                            autoComplete="off"
                                            maxLength={6}
                                            inputMode="numeric"
                                            type="password"
                                            value={field.value ?? ""}
                                            autoFocus
                                        />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )} />
                            )}

                            {authType === KeyVaultAuthType.PASSWORD && (
                                <Controller name="password" control={form.control} render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel htmlFor="create-vault-password">Password</FieldLabel>
                                        <FieldDescription>Minimum 8 characters</FieldDescription>
                                        <Input
                                            {...field}
                                            id="create-vault-password"
                                            placeholder="Your strong password"
                                            autoComplete="off"
                                            type="password"
                                            value={field.value ?? ""}
                                            autoFocus
                                        />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )} />
                            )}

                            {authType === KeyVaultAuthType.NONE && (
                                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                                    No credential required — vault will be accessible without authentication.
                                </div>
                            )}
                        </FieldGroup>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setStep(1)}>
                                Back
                            </Button>
                            <Button type="button" onClick={handleStep2Submit} disabled={isPending}>
                                {isPending
                                    ? <LoaderCircle className="size-4 animate-spin" />
                                    : <Vault className="size-4" />
                                }
                                Create Vault
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {/* Step 3 — Error only */}
                {step === 3 && (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                                <ShieldAlert className="size-6 text-destructive" />
                            </div>
                            <div>
                                <p className="font-medium text-sm">Failed to create vault</p>
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