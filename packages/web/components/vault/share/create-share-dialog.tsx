import { LoaderCircle, Share2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { ReactNode, useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { browserLog } from "@/lib/browser-logger";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { KeyVaultAuthType } from "@/prisma/generated/browser";
import { createVaultShare } from "@/server/actions/vault-shares";
import { getKeys } from "@/server/queries/vault-keys";

export function CreateShareDialog({
    vaultId,
    authType,
    children,
    onCreated,
}: {
    vaultId: string;
    authType: KeyVaultAuthType;
    children: ReactNode;
    onCreated?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<"DIRECT" | "REQUEST">("DIRECT");
    const [passphrase, setPassphrase] = useState("");
    const [secret, setSecret] = useState("");
    const [maxKeys, setMaxKeys] = useState("");
    const [shareAll, setShareAll] = useState(true);
    const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([]);
    const [serverError, setServerError] = useState<string | null>(null);

    const requiresSecret = authType !== KeyVaultAuthType.NONE;

    const { data: keysResult } = useServerQuery(
        open && !shareAll ? ["vault-keys-for-share", vaultId] : null,
        () => getKeys({ keyVaultId: vaultId, page: 1, pageSize: 100, sortOrder: "asc", filters: { tags: [] } }),
    );
    const keys = useMemo(() => (keysResult?.success ? keysResult.data.games : []), [keysResult]);

    const { executeAsync, isPending } = useAction(createVaultShare);

    const reset = useCallback(() => {
        setMode("DIRECT");
        setPassphrase("");
        setSecret("");
        setMaxKeys("");
        setShareAll(true);
        setSelectedKeyIds([]);
        setServerError(null);
    }, []);

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next);
        if (!next) reset();
    }, [reset]);

    const toggleKey = useCallback((id: string) => {
        setSelectedKeyIds((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));
    }, []);

    const handleSubmit = useCallback(async () => {
        setServerError(null);

        if (passphrase.length < 6) {
            setServerError("Passphrase must be at least 6 characters.");
            return;
        }
        if (requiresSecret && secret.length === 0) {
            setServerError("Enter the vault PIN or password to create a share.");
            return;
        }

        const parsedMax = maxKeys.trim() === "" ? null : Number(maxKeys);
        if (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax <= 0)) {
            setServerError("Key limit must be a positive whole number.");
            return;
        }

        browserLog.info("Create share submitted", { vaultId, mode, shareAll });
        const result = await executeAsync({
            vaultId,
            mode,
            maxKeys: parsedMax,
            passphrase,
            secret: requiresSecret ? secret : undefined,
            keyVaultGameIds: shareAll ? [] : selectedKeyIds,
        });

        if (result?.data?.id) {
            onCreated?.();
            setOpen(false);
            setTimeout(reset, 300);
        } else {
            setServerError(result?.serverError ?? "An unexpected error occurred.");
        }
    }, [executeAsync, maxKeys, mode, onCreated, passphrase, requiresSecret, reset, secret, selectedKeyIds, shareAll, vaultId]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent className="outline-none sm:max-w-150">
                <DialogHeader>
                    <DialogTitle>Share Vault</DialogTitle>
                    <DialogDescription>
                        Recipients unlock keys with the passphrase you set here. Share the passphrase separately.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="share-mode">Redemption</FieldLabel>
                            <Select value={mode} onValueChange={(v) => setMode(v as "DIRECT" | "REQUEST")}>
                                <SelectTrigger id="share-mode" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="DIRECT">Direct claim — recipients take keys instantly</SelectItem>
                                    <SelectItem value="REQUEST">Request — you approve each key</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="share-passphrase">Share passphrase</FieldLabel>
                            <Input
                                id="share-passphrase"
                                type="password"
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                placeholder="At least 6 characters"
                                autoComplete="off"
                            />
                            <FieldDescription>Recipients enter this to reveal keys.</FieldDescription>
                        </Field>

                        {requiresSecret && (
                            <Field>
                                <FieldLabel htmlFor="share-secret">
                                    Vault {authType === KeyVaultAuthType.PIN ? "PIN" : "password"}
                                </FieldLabel>
                                <Input
                                    id="share-secret"
                                    type="password"
                                    value={secret}
                                    onChange={(e) => setSecret(e.target.value)}
                                    placeholder="Unlock the vault to build the share"
                                    autoComplete="off"
                                />
                            </Field>
                        )}

                        <Field>
                            <FieldLabel htmlFor="share-max">Key limit per recipient (optional)</FieldLabel>
                            <Input
                                id="share-max"
                                inputMode="numeric"
                                value={maxKeys}
                                onChange={(e) => setMaxKeys(e.target.value.replace(/\D/g, ""))}
                                placeholder="Unlimited"
                            />
                        </Field>

                        <Field orientation="horizontal">
                            <FieldLabel htmlFor="share-all">Share all keys</FieldLabel>
                            <Switch id="share-all" checked={shareAll} onCheckedChange={setShareAll} />
                        </Field>

                        {!shareAll && (
                            <Field>
                                <FieldLabel>Select keys</FieldLabel>
                                <ScrollArea className="h-48 w-full rounded-md border border-border p-2">
                                    {keys.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No keys available.</p>
                                    ) : (
                                        keys.map((k) => (
                                            <label key={k.id} className="flex items-center gap-2 py-1 text-sm">
                                                <Checkbox
                                                    checked={selectedKeyIds.includes(k.id)}
                                                    onCheckedChange={() => toggleKey(k.id)}
                                                />
                                                <span className="truncate">{k.game?.name ?? k.originalName}</span>
                                            </label>
                                        ))
                                    )}
                                </ScrollArea>
                            </Field>
                        )}
                    </FieldGroup>

                    {serverError && <p className="text-sm text-destructive">{serverError}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="button" onClick={handleSubmit} disabled={isPending}>
                            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Share2 className="size-4" />}
                            Create share
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
