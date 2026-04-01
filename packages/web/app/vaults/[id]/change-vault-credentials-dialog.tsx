"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Shield, ShieldCheck } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { ReactNode, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyVaultAuthType } from "@/prisma/generated/browser";
import { changeVaultCredentials } from "@/server/actions/vaults/credentials";

const schema = z
    .object({
        newAuthType: z.enum([KeyVaultAuthType.PIN, KeyVaultAuthType.PASSWORD]),
        newPin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric").optional(),
        newPassword: z.string().min(8).optional(),
        currentSecret: z.string().optional(),
        recoveryKey: z.string().optional(),
    })
    .superRefine((data, ctx) => {
        if (data.newAuthType === KeyVaultAuthType.PIN && !data.newPin) {
            ctx.addIssue({ path: ["newPin"], message: "PIN is required.", code: "custom" });
        }

        if (data.newAuthType === KeyVaultAuthType.PASSWORD && !data.newPassword) {
            ctx.addIssue({ path: ["newPassword"], message: "Password is required.", code: "custom" });
        }

        if (!data.currentSecret && !data.recoveryKey) {
            ctx.addIssue({ path: ["currentSecret"], message: "Provide current secret or recovery key.", code: "custom" });
        }
    });

type FormValues = z.infer<typeof schema>;

interface ChangeVaultCredentialsDialogProps {
    vaultId: string;
    currentAuthType: KeyVaultAuthType;
    onSuccess?: () => void;
    children: ReactNode;
}

export function ChangeVaultCredentialsDialog({
    vaultId,
    currentAuthType,
    onSuccess,
    children,
}: ChangeVaultCredentialsDialogProps) {
    const [open, setOpen] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            newAuthType: currentAuthType === KeyVaultAuthType.PIN ? KeyVaultAuthType.PIN : KeyVaultAuthType.PASSWORD,
            newPin: undefined,
            newPassword: undefined,
            currentSecret: "",
            recoveryKey: "",
        },
    });

    const newAuthType = useWatch({ control: form.control, name: "newAuthType" });

    const { executeAsync, isPending } = useAction(changeVaultCredentials);

    const handleSubmit = form.handleSubmit(async (values) => {
        setServerError(null);

        const result = await executeAsync({
            vaultId,
            newAuthType: values.newAuthType,
            newPin: values.newPin,
            newPassword: values.newPassword,
            currentSecret: values.currentSecret || undefined,
            recoveryKey: values.recoveryKey || undefined,
        });

        if (result?.data?.success) {
            onSuccess?.();
            setOpen(false);
            form.reset();
            return;
        }

        setServerError(result?.serverError ?? "Failed to update vault credentials.");
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-lg outline-none">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="size-4" />
                        Change Vault Credentials
                    </DialogTitle>
                    <DialogDescription>
                        Rotate your vault PIN/password without re-encrypting all keys. You can authenticate using the current secret or the recovery key.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <FieldGroup>
                        <Controller
                            name="newAuthType"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>New Authentication Type</FieldLabel>
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select auth type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={KeyVaultAuthType.PIN}>PIN</SelectItem>
                                            <SelectItem value={KeyVaultAuthType.PASSWORD}>Password</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )}
                        />

                        {newAuthType === KeyVaultAuthType.PIN && (
                            <Controller
                                name="newPin"
                                control={form.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>New PIN</FieldLabel>
                                        <Input
                                            {...field}
                                            value={field.value ?? ""}
                                            type="password"
                                            inputMode="numeric"
                                            maxLength={6}
                                            placeholder="Enter new PIN"
                                        />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                        )}

                        {newAuthType === KeyVaultAuthType.PASSWORD && (
                            <Controller
                                name="newPassword"
                                control={form.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel>New Password</FieldLabel>
                                        <Input
                                            {...field}
                                            value={field.value ?? ""}
                                            type="password"
                                            placeholder="Enter new password"
                                        />
                                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                    </Field>
                                )}
                            />
                        )}

                        <Controller
                            name="currentSecret"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel>Current PIN/Password (optional if recovery key is provided)</FieldLabel>
                                    <Input
                                        {...field}
                                        value={field.value ?? ""}
                                        type="password"
                                        placeholder="Enter current vault secret"
                                    />
                                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                                </Field>
                            )}
                        />

                        <Controller
                            name="recoveryKey"
                            control={form.control}
                            render={({ field }) => (
                                <Field>
                                    <FieldLabel>Recovery Key (optional)</FieldLabel>
                                    <Input
                                        {...field}
                                        value={field.value ?? ""}
                                        placeholder="Paste your recovery key"
                                    />
                                </Field>
                            )}
                        />
                    </FieldGroup>

                    {serverError && (
                        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {serverError}
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                            Save
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
