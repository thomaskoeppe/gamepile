import {CheckCircle2, Eye, EyeOff, FileText, Plus, XCircle} from "lucide-react";
import {AlertCircle} from "lucide-react";
import {useAction} from "next-safe-action/hooks";
import {startTransition, useEffect, useState} from "react";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription, DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Textarea} from "@/components/ui/textarea";
import {KeyVaultAuthType} from "@/prisma/generated/browser";
import {importKeys} from "@/server/actions/vault-keys";

type Key = {
    name: string;
    code: string;
    isValid: boolean;
    reason?: string;
}

export function KeyImport({ keyVaultId, disabled, onRefresh, keyVaultAuthType }: { keyVaultId: string; disabled: boolean; onRefresh?: () => void; keyVaultAuthType: KeyVaultAuthType }) {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [text, setText] = useState<string>("");
    const [items, setItems] = useState<Key[]>([]);
    const [showAuthInput, setShowAuthInput] = useState<boolean>(false);
    const [authInput, setAuthInput] = useState<string | null>(null);
    const [result, setResult] = useState<{ [key: string]: { success: boolean; reason?: string } }>({});
    const [importError, setImportError] = useState<string | null>(null);

    const { execute: executeImport, isPending: isLoading } = useAction(importKeys, {
        onSuccess: ({ data }) => {
            setResult(data ?? {});
            setImportError(null);
            if (onRefresh) onRefresh();
        },
        onError: ({ error }) => {
            setImportError(error.serverError ?? "Failed to import keys. Please check your credentials and try again.");
        },
    });

    useEffect(() => {
        startTransition(async () => {
            const delimiters = /[,;:\/\\|\t\s]+/;

            const lines = text.split("\n");
            const items: Key[] = [];

            lines.forEach((line) => {
                if (line.trim() === "") return;

                const segments = line.split(delimiters);
                const name = segments.length > 1 ? segments.slice(0, -1).join(" ").trim() : "Unknown Game";
                const key = segments[segments.length - 1].trim();

                const keyPattern = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;
                const isValid = keyPattern.test(key);

                items.push({
                    name: name,
                    code: key,
                    isValid: isValid,
                    reason: isValid ? undefined : "Invalid key format"
                });
            });

            setItems(items);
        });
    }, [text]);

    const handleImport = () => {
        if (items.length === 0) return;
        setImportError(null);

        executeImport({
            vaultId: keyVaultId,
            keys: items.filter(i => i.isValid).map(i => ({ name: i.name, code: i.code })),
            secret: keyVaultAuthType !== KeyVaultAuthType.NONE ? authInput || undefined : undefined,
        });
    };

    const handleClose = () => {
        setIsOpen(false);
        setText("");
        setItems([]);
        setResult({});
        setImportError(null);
    };

    const hasResults = Object.keys(result).length > 0;

    if (disabled) {
        return (
            <Button variant="outline" className="border-border hover:bg-card hover:border-primary transition-all duration-300 bg-transparent hover:text-foreground" disabled={true}>
                <Plus className="h-4 w-4"/> Import Keys
            </Button>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) =>  { if (!open) handleClose(); else setIsOpen(true); } }>
            <DialogTrigger asChild>
                <Button variant="outline"
                        className="border-border hover:bg-card hover:border-primary transition-all duration-300 bg-transparent hover:text-foreground"
                        onClick={() => setIsOpen(true)}>
                    <Plus className="h-4 w-4"/> Import Keys
                </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-150 flex flex-col h-[80vh]">
                <DialogHeader>
                    <DialogTitle>Import Keys</DialogTitle>
                    <DialogDescription>Import multiple keys by pasting them below. You can include the game name before each key.</DialogDescription>
                </DialogHeader>

                {keyVaultAuthType === KeyVaultAuthType.PIN && (
                    <div className="pt-4 flex flex-col gap-2">
                        <Label>Please provide your PIN code</Label>
                        <Input
                            type="tel"
                            inputMode="numeric"
                            maxLength={6}
                            pattern="[0-9]*"
                            placeholder="Enter PIN"
                            value={authInput || ""}
                            onChange={(e) => setAuthInput(e.target.value.replace(/\D/g, ""))}
                            className="bg-card border-border tracking-widest focus-visible:border-primary focus-visible:ring-ring"
                            disabled={isLoading}
                        />
                    </div>
                )}

                {keyVaultAuthType === KeyVaultAuthType.PASSWORD && (
                    <div className="pt-4 flex flex-col gap-2">
                        <Label>Please provide your password</Label>
                        <div className="relative">
                            <Input
                                type={showAuthInput ? "text" : "password"}
                                placeholder="Enter password"
                                value={authInput || ""}
                                onChange={(e) => setAuthInput(e.target.value)}
                                className="bg-card border-border pr-10 focus-visible:border-primary focus-visible:ring-ring"
                                disabled={isLoading}
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowAuthInput((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                tabIndex={-1}
                            >
                                {showAuthInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                )}

                <div className="grid gap-4 py-4 flex-1 min-h-0">
                    <div className="flex flex-col gap-2 flex-1 min-h-0">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Raw Text Input {text != "" && `(${text.split("\n").filter((l) => l.trim() !== "").length} lines)`}
                        </label>

                        <Textarea
                            placeholder={`Item A 12345-ABCDE-67890\nItem B ABCDE-12345-FGHIJ`}
                            className="font-mono text-sm resize-none h-full p-4 overflow-auto"
                            autoCapitalize="off"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            value={text}
                            disabled={isLoading}
                            onChange={(e) => setText(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-col gap-2 flex-[2] min-h-0">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium leading-none">Detected Items ({items.length})</label>
                            {items.length > 0 && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3 text-green-500" /> {items.filter((i) => i.isValid).length} Valid
                                    </span>

                                    <span className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
                                        <AlertCircle className="h-3 w-3 text-amber-500" /> {items.filter((i) => !i.isValid).length} Invalid
                                    </span>

                                    {hasResults && (
                                        <>
                                            <span className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
                                                <XCircle className="h-3 w-3 text-red-500" /> {Object.values(result).filter(r => !r.success).length} Failed
                                            </span>

                                                <span className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
                                                <CheckCircle2 className="h-3 w-3 text-green-500" /> {Object.values(result).filter(r => r.success).length} Imported
                                            </span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="border rounded-md flex-1 overflow-hidden bg-muted/50">
                            {items.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm p-4 text-center">
                                    <FileText className="h-8 w-8 mb-2 opacity-20" />
                                    <p>No valid codes detected yet.</p>
                                </div>
                            ) : (
                                <ScrollArea className="h-full">
                                    <div className="p-4 space-y-2">
                                        {items.map((item, index) => {
                                            const hasResult = hasResults && item.isValid;
                                            const resultData = hasResult ? result[item.code] : null;
                                            const isSuccess = resultData?.success === true;
                                            const isFailed = resultData && !resultData.success;

                                            return (
                                                <div key={index} className={`flex items-start gap-3 p-3 rounded-md border text-sm ${
                                                    isSuccess
                                                        ? "bg-green-950/20 border-green-900"
                                                        : isFailed
                                                            ? "bg-red-950/20 border-red-900"
                                                            : !item.isValid
                                                                ? "bg-amber-950/20 border-amber-900"
                                                                : "bg-background"
                                                }`}>
                                                    <div className="flex-1 min-w-0 space-y-1">
                                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                                            <span className="font-medium break-words" title={item.name}>
                                                                {item.name}
                                                            </span>

                                                            <Badge
                                                                variant="outline"
                                                                className={`font-mono text-xs shrink-0 break-all ${
                                                                    isSuccess
                                                                        ? "border-green-700"
                                                                        : isFailed
                                                                            ? "border-red-700"
                                                                            : !item.isValid
                                                                                ? "border-amber-700"
                                                                                : ""
                                                                }`}
                                                            >
                                                                {item.code}
                                                            </Badge>
                                                        </div>

                                                        {(isSuccess || isFailed || !item.isValid) && (
                                                            <p
                                                                className={`text-xs break-words ${
                                                                    isSuccess
                                                                        ? "text-green-400"
                                                                        : isFailed
                                                                            ? "text-red-400"
                                                                            : "text-amber-400"
                                                                }`}
                                                            >
                                                                {isSuccess
                                                                    ? "Imported successfully"
                                                                    : isFailed
                                                                        ? resultData?.reason || "Failed to import"
                                                                        : item.reason}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex-col gap-2">
                    {importError && (
                        <div className="w-full flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <AlertCircle className="size-4 shrink-0" />
                            <span>{importError}</span>
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                            Cancel
                        </Button>

                        {Object.keys(result).length === 0 ? (
                            <Button
                                onClick={handleImport}
                                disabled={
                                    items.filter(i => i.isValid).length === 0
                                    || isLoading
                                    || (keyVaultAuthType !== KeyVaultAuthType.NONE && !authInput)
                                }
                            >
                                {isLoading ? "Importing..." : "Continue"}
                            </Button>
                        ) : (
                            <Button onClick={handleClose}>
                                Close
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}