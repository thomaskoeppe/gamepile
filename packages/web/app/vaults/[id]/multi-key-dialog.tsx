"use client";

import {
    AlertCircle,
    Check,
    ClipboardCopy,
    ExternalLink,
    Eye,
    EyeOff,
    LoaderCircle,
    Lock,
    TicketCheck,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyVaultAuthType } from "@/prisma/generated/browser";
import { getDecryptedKeys, redeemKeys } from "@/server/actions/vault-keys";

import type { VaultGameRow } from "./table-columns";

interface MultiKeyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    keyVaultAuthType: KeyVaultAuthType;
    selectedGames: VaultGameRow[];
    onMutate: () => void;
    onClearSelection: () => void;
}

export function MultiKeyDialog({
    open,
    onOpenChange,
    keyVaultAuthType,
    selectedGames,
    onMutate,
    onClearSelection,
}: MultiKeyDialogProps) {
    const needsAuth = keyVaultAuthType !== KeyVaultAuthType.NONE;
    const isPin = keyVaultAuthType === KeyVaultAuthType.PIN;

    const [secret, setSecret] = useState("");
    const [showSecret, setShowSecret] = useState(false);
    const [isLoadingKeys, setIsLoadingKeys] = useState(false);
    const [decryptError, setDecryptError] = useState<string | null>(null);
    const [decrypted, setDecrypted] = useState<Array<{ vaultGameId: string; gameName: string; key?: string; error?: string }>>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const redeemAction = useAction(redeemKeys, {
        onSuccess: () => {
            onMutate();
            onClearSelection();
            setDecrypted([]);
            onOpenChange(false);
        },
    });

    const decryptableIds = useMemo(() => selectedGames.map((game) => game.id), [selectedGames]);

    const handleClose = () => {
        setSecret("");
        setShowSecret(false);
        setDecrypted([]);
        setDecryptError(null);
        setCopiedId(null);
        onOpenChange(false);
    };

    const handleDecrypt = async () => {
        if (decryptableIds.length === 0) return;

        setIsLoadingKeys(true);
        setDecryptError(null);

        const result = await getDecryptedKeys({
            vaultGameIds: decryptableIds,
            secret: needsAuth ? secret || undefined : undefined,
        });

        setIsLoadingKeys(false);

        if (result?.data) {
            setDecrypted(result.data);
            return;
        }

        setDecryptError(result?.serverError ?? "Failed to decrypt selected keys");
    };

    const successfulKeys = decrypted.filter((entry) => Boolean(entry.key));

    const handleMarkRedeemed = () => {
        const ids = successfulKeys.map((entry) => entry.vaultGameId);
        if (ids.length === 0) return;

        redeemAction.execute({ vaultGameIds: ids });
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : handleClose())}>
            <DialogContent className="sm:max-w-2xl outline-none">
                <DialogHeader>
                    <DialogTitle>Redeem Selected Keys</DialogTitle>
                    <DialogDescription>
                        Decrypt all selected keys in one step, then mark them as redeemed after activation.
                    </DialogDescription>
                </DialogHeader>

                {decrypted.length === 0 && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            {selectedGames.length} key{selectedGames.length === 1 ? "" : "s"} selected.
                        </p>

                        {needsAuth && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">
                                    Enter vault {isPin ? "PIN" : "password"}
                                </label>
                                {isPin ? (
                                    <Input
                                        type="tel"
                                        inputMode="numeric"
                                        maxLength={6}
                                        pattern="[0-9]*"
                                        placeholder="Enter PIN"
                                        value={secret}
                                        onChange={(event) => setSecret(event.target.value.replace(/\D/g, ""))}
                                        className="bg-muted border-border text-center text-xl tracking-widest"
                                        autoFocus
                                    />
                                ) : (
                                    <div className="relative">
                                        <Input
                                            type={showSecret ? "text" : "password"}
                                            placeholder="Enter vault password"
                                            value={secret}
                                            onChange={(event) => setSecret(event.target.value)}
                                            className="bg-muted border-border pr-10"
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowSecret((value) => !value)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                            tabIndex={-1}
                                        >
                                            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {decryptError && (
                            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                {decryptError}
                            </div>
                        )}

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>Cancel</Button>
                            <Button
                                onClick={handleDecrypt}
                                disabled={isLoadingKeys || (needsAuth && secret.length === 0)}
                            >
                                {isLoadingKeys ? <LoaderCircle className="size-4 animate-spin" /> : <Lock className="size-4" />}
                                Decrypt Selected Keys
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {decrypted.length > 0 && (
                    <div className="space-y-4">
                        <ScrollArea className="max-h-[420px] rounded-md border border-border bg-muted/30 p-3">
                            <div className="space-y-3">
                                {decrypted.map((entry) => (
                                    <div key={entry.vaultGameId} className="rounded-md border border-border bg-background p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-medium">{entry.gameName}</p>
                                            {!entry.key ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                                    <AlertCircle className="size-3" />
                                                    {entry.error ?? "Failed"}
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs sm:text-sm font-mono">{entry.key}</code>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={async () => {
                                                            if (!entry.key) return;
                                                            await navigator.clipboard.writeText(entry.key);
                                                            setCopiedId(entry.vaultGameId);
                                                            setTimeout(() => setCopiedId(null), 1500);
                                                        }}
                                                    >
                                                        {copiedId === entry.vaultGameId ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            if (!entry.key) return;
                                                            window.open(`https://store.steampowered.com/account/registerkey?key=${entry.key}`, "_blank");
                                                        }}
                                                    >
                                                        <ExternalLink className="size-4" /> Steam
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>

                        <DialogFooter>
                            <Button variant="outline" onClick={handleClose}>Close</Button>
                            <Button
                                onClick={handleMarkRedeemed}
                                disabled={successfulKeys.length === 0 || redeemAction.isPending}
                            >
                                {redeemAction.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <TicketCheck className="size-4" />}
                                Mark {successfulKeys.length} as Redeemed
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

