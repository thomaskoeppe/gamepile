"use client";

import { Check, ClipboardCopy, LoaderCircle, TriangleAlert } from "lucide-react";
import { use, useState } from "react";

import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import { claimSharedKey, requestSharedGame, revealApprovedKey } from "@/server/actions/vault-shares";
import { getShareForRecipient, type ShareGameView } from "@/server/queries/vault-shares";

function RevealedKey({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <span className="flex items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{value}</code>
            <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={async () => {
                    await navigator.clipboard.writeText(value);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                }}
            >
                {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
            </Button>
        </span>
    );
}

export default function SharedVaultPage({ params }: { params: Promise<{ shareId: string }> }) {
    const { shareId } = use(params);
    const { user } = useSession();
    const [passphrase, setPassphrase] = useState("");
    const [revealed, setRevealed] = useState<Record<string, string>>({});
    const [rowError, setRowError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const { data, isLoading, mutate } = useServerQuery(
        user ? ["share-recipient", shareId, user.id] : null,
        () => getShareForRecipient({ shareId }),
    );

    const share = data?.success ? data.data : null;

    const claim = async (game: ShareGameView) => {
        setRowError(null);
        if (passphrase.length < 6) {
            setRowError("Enter the share passphrase first.");
            return;
        }
        setBusyId(game.keyVaultGameId);
        const result = await claimSharedKey({ shareId, keyVaultGameId: game.keyVaultGameId, passphrase });
        setBusyId(null);
        if (result?.data?.key) {
            setRevealed((prev) => ({ ...prev, [game.keyVaultGameId]: result.data!.key }));
            void mutate();
        } else {
            setRowError(result?.serverError ?? "Could not claim this key.");
        }
    };

    const request = async (game: ShareGameView) => {
        setRowError(null);
        setBusyId(game.keyVaultGameId);
        const result = await requestSharedGame({ shareId, keyVaultGameId: game.keyVaultGameId });
        setBusyId(null);
        if (result?.data?.success) {
            void mutate();
        } else {
            setRowError(result?.serverError ?? "Could not request this key.");
        }
    };

    const reveal = async (game: ShareGameView) => {
        setRowError(null);
        if (!game.requestId) return;
        if (passphrase.length < 6) {
            setRowError("Enter the share passphrase first.");
            return;
        }
        setBusyId(game.keyVaultGameId);
        const result = await revealApprovedKey({ requestId: game.requestId, passphrase });
        setBusyId(null);
        if (result?.data?.key) {
            setRevealed((prev) => ({ ...prev, [game.keyVaultGameId]: result.data!.key }));
        } else {
            setRowError(result?.serverError ?? "Could not reveal this key.");
        }
    };

    function renderAction(game: ShareGameView) {
        const key = revealed[game.keyVaultGameId];
        if (key) return <RevealedKey value={key} />;

        const busy = busyId === game.keyVaultGameId;

        if (game.redeemed && !game.redeemedByMe) {
            return <Badge variant="outline">Unavailable</Badge>;
        }

        if (share?.mode === "DIRECT") {
            if (game.redeemedByMe) return <Badge variant="secondary">Claimed</Badge>;
            return (
                <Button size="sm" disabled={busy} onClick={() => claim(game)}>
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Claim
                </Button>
            );
        }

        // REQUEST mode
        if (game.requestStatus === "APPROVED") {
            return (
                <Button size="sm" disabled={busy} onClick={() => reveal(game)}>
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Reveal key
                </Button>
            );
        }
        if (game.requestStatus === "PENDING") return <Badge variant="secondary">Requested</Badge>;
        if (game.requestStatus === "DENIED") return <Badge variant="outline">Denied</Badge>;
        return (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => request(game)}>
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Request
            </Button>
        );
    }

    return (
        <>
            <Header />

            <div className="container-fluid mx-auto px-4 py-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <LoaderCircle className="size-8 animate-spin text-muted-foreground" />
                    </div>
                ) : !share ? (
                    <div className="flex items-center justify-center px-4 py-16">
                        <Card className="bg-card border-destructive/50">
                            <CardContent className="flex flex-col items-center gap-3 text-center">
                                <TriangleAlert className="h-10 w-10 text-destructive" />
                                <p className="text-sm text-muted-foreground">
                                    This share does not exist or you do not have access to it.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <Card className="bg-card border-border">
                            <CardHeader>
                                <CardTitle>{share.vaultName}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {share.requiresPassphrase && (
                                    <div className="max-w-sm">
                                        <Input
                                            type="password"
                                            value={passphrase}
                                            onChange={(e) => setPassphrase(e.target.value)}
                                            placeholder="Share passphrase"
                                            autoComplete="off"
                                        />
                                    </div>
                                )}
                                {rowError && <p className="text-sm text-destructive">{rowError}</p>}
                            </CardContent>
                        </Card>

                        <Card className="bg-card border-border">
                            <CardContent className="divide-y divide-border p-0">
                                {share.games.length === 0 ? (
                                    <p className="p-6 text-center text-sm text-muted-foreground">No keys in this share.</p>
                                ) : (
                                    share.games.map((game) => (
                                        <div key={game.keyVaultGameId} className="flex items-center justify-between gap-3 px-4 py-3">
                                            <span className="truncate text-sm">{game.name}</span>
                                            <div className="shrink-0">{renderAction(game)}</div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </>
    );
}
