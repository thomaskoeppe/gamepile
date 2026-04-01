"use client";

import {
    AlertCircle, Check, ClipboardCopy, ExternalLink, Eye, EyeOff,
    LoaderCircle, Lock, TicketCheck, Undo2,
} from "lucide-react";
import { SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import type { KeyDialogState } from "./key-dialog.hook";

interface KeyDialogComponentProps {
    keyDialog: KeyDialogState;
    secret: string;
    setSecret: (s: string) => void;
    showSecret: boolean;
    setShowSecret: (v: boolean | ((prev: boolean) => boolean)) => void;
    copied: boolean;
    needsAuth: boolean;
    isPin: boolean;
    redeemAction: { isPending: boolean };
    unredeemAction: { isPending: boolean };
    closeKeyDialog: () => void;
    handleAuthSubmit: (e: SubmitEvent) => void;
    handleCopyKey: () => void;
    handleRedeemOnSteam: () => void;
    handleMarkRedeemed: () => void;
    handleMarkUnredeemed: () => void;
    handleAuthRetry: () => void;
}

export function KeyDialog({
    keyDialog,
    secret,
    setSecret,
    showSecret,
    setShowSecret,
    copied,
    needsAuth,
    isPin,
    redeemAction,
    unredeemAction,
    closeKeyDialog,
    handleAuthSubmit,
    handleCopyKey,
    handleRedeemOnSteam,
    handleMarkRedeemed,
    handleMarkUnredeemed,
    handleAuthRetry
}: KeyDialogComponentProps) {
    const dialogOpen = keyDialog.phase !== "closed";
    const dialogGame = keyDialog.phase !== "closed" ? keyDialog.game : null;
    const gameName = dialogGame?.game?.name ?? dialogGame?.originalName ?? "Unknown Game";

    return (
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeKeyDialog(); }}>
            <DialogContent className="sm:max-w-md outline-none">
                <DialogHeader>
                    <DialogTitle>
                        {keyDialog.phase === "auth" && (
                            <span className="flex items-center gap-2">
                                <Lock className="size-5 text-primary" />
                                Vault Authentication
                            </span>
                        )}
                        {keyDialog.phase === "loading" && "Decrypting Key…"}
                        {keyDialog.phase === "key" && gameName}
                        {keyDialog.phase === "error" && "Decryption Failed"}
                    </DialogTitle>
                    {keyDialog.phase === "auth" && (
                        <DialogDescription>
                            Enter your vault {isPin ? "PIN" : "password"} to view the key for{" "}
                            <span className="font-medium text-foreground">{gameName}</span>.
                        </DialogDescription>
                    )}
                </DialogHeader>

                {keyDialog.phase === "auth" && (
                    <form onSubmit={handleAuthSubmit} className="space-y-4">
                        <div className="relative">
                            {isPin ? (
                                <Input
                                    type="tel"
                                    inputMode="numeric"
                                    maxLength={6}
                                    pattern="[0-9]*"
                                    placeholder="Enter PIN"
                                    value={secret}
                                    onChange={(e) => setSecret(e.target.value.replace(/\D/g, ""))}
                                    className="bg-muted border-border text-center text-xl tracking-widest"
                                    autoFocus
                                />
                            ) : (
                                <div className="relative">
                                    <Input
                                        type={showSecret ? "text" : "password"}
                                        placeholder="Enter vault password"
                                        value={secret}
                                        onChange={(e) => setSecret(e.target.value)}
                                        className="bg-muted border-border pr-10"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSecret((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        tabIndex={-1}
                                    >
                                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={closeKeyDialog}>Cancel</Button>
                            <Button type="submit" disabled={secret.length === 0}>
                                <Lock className="size-4" /> Decrypt Key
                            </Button>
                        </DialogFooter>
                    </form>
                )}

                {keyDialog.phase === "loading" && (
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                        <LoaderCircle className="size-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Decrypting key for {gameName}…</p>
                    </div>
                )}

                {keyDialog.phase === "key" && (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                            <code className="font-mono text-lg tracking-wider select-all text-foreground">
                                {keyDialog.key}
                            </code>
                        </div>

                        {dialogGame?.redeemed && (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                                Redeemed by{" "}
                                <span className="font-medium text-foreground">
                                    {dialogGame.redeemedBy?.username ?? "Unknown"}
                                </span>{" "}
                                on {new Date(dialogGame.redeemedAt!).toLocaleDateString()}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={handleCopyKey} className="flex-1">
                                {copied ? <><Check className="size-4" /> Copied!</> : <><ClipboardCopy className="size-4" /> Copy Key</>}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleRedeemOnSteam} className="flex-1">
                                <ExternalLink className="size-4" /> Redeem on Steam
                            </Button>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            {!dialogGame?.redeemed ? (
                                <Button size="sm" onClick={handleMarkRedeemed} disabled={redeemAction.isPending}>
                                    {redeemAction.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <TicketCheck className="size-4" />}
                                    Mark as Redeemed
                                </Button>
                            ) : (
                                <Button variant="outline" size="sm" onClick={handleMarkUnredeemed} disabled={unredeemAction.isPending}>
                                    {unredeemAction.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                                    Mark as Unredeemed
                                </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={closeKeyDialog}>Close</Button>
                        </DialogFooter>
                    </div>
                )}

                {keyDialog.phase === "error" && (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10">
                                <AlertCircle className="size-6 text-destructive" />
                            </div>
                            <p className="text-sm text-muted-foreground">{keyDialog.error}</p>
                        </div>
                        <DialogFooter>
                            {needsAuth && (
                                <Button variant="outline" onClick={handleAuthRetry}>
                                    Try Again
                                </Button>
                            )}
                            <Button variant="ghost" onClick={closeKeyDialog}>Close</Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
