"use client";

import { useAction } from "next-safe-action/hooks";
import { type SubmitEvent, useCallback, useState } from "react";

import { KeyVaultAuthType } from "@/prisma/generated/browser";
import {
    getDecryptedKey,
    redeemKey as redeemKeyAction,
    unredeemKey as unredeemKeyAction,
} from "@/server/actions/vault-keys";

import type { VaultGameRow } from "./table-columns";

export type KeyDialogState =
    | { phase: "closed" }
    | { phase: "auth"; game: VaultGameRow }
    | { phase: "loading"; game: VaultGameRow }
    | { phase: "key"; game: VaultGameRow; key: string }
    | { phase: "error"; game: VaultGameRow; error: string };

interface UseKeyDialogProps {
    keyVaultAuthType: KeyVaultAuthType;
    onMutate: () => void;
}

export function useKeyDialog({ keyVaultAuthType, onMutate }: UseKeyDialogProps) {
    const [keyDialog, setKeyDialog] = useState<KeyDialogState>({ phase: "closed" });
    const [secret, setSecret] = useState("");
    const [showSecret, setShowSecret] = useState(false);
    const [copied, setCopied] = useState(false);

    const needsAuth = keyVaultAuthType !== KeyVaultAuthType.NONE;
    const isPin = keyVaultAuthType === KeyVaultAuthType.PIN;

    const redeemAction = useAction(redeemKeyAction, { onSuccess: () => onMutate() });
    const unredeemAction = useAction(unredeemKeyAction, { onSuccess: () => onMutate() });

    const decryptKey = useCallback(async (game: VaultGameRow, secretOverride?: string) => {
        setKeyDialog({ phase: "loading", game });
        const result = await getDecryptedKey({
            vaultGameId: game.id,
            secret: secretOverride || undefined,
        });

        if (result?.data) {
            setKeyDialog({ phase: "key", game, key: result.data });
        } else {
            setKeyDialog({
                phase: "error",
                game,
                error: result?.serverError ?? "Failed to decrypt key",
            });
        }
    }, []);

    const openKeyDialog = useCallback(
        (game: VaultGameRow) => {
            setSecret("");
            setShowSecret(false);
            setCopied(false);
            if (needsAuth) {
                setKeyDialog({ phase: "auth", game });
            } else {
                setKeyDialog({ phase: "loading", game });
                void decryptKey(game);
            }
        },
        [decryptKey, needsAuth],
    );

    const closeKeyDialog = useCallback(() => {
        setKeyDialog({ phase: "closed" });
        setSecret("");
        setShowSecret(false);
        setCopied(false);
    }, []);

    const handleAuthSubmit = useCallback(
        (e: SubmitEvent) => {
            e.preventDefault();
            if (keyDialog.phase !== "auth") return;
            void decryptKey(keyDialog.game, secret);
        },
        [keyDialog, secret, decryptKey],
    );

    const handleCopyKey = useCallback(async () => {
        if (keyDialog.phase !== "key") return;
        await navigator.clipboard.writeText(keyDialog.key);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [keyDialog]);

    const handleRedeemOnSteam = useCallback(() => {
        if (keyDialog.phase !== "key") return;
        window.open(`https://store.steampowered.com/account/registerkey?key=${keyDialog.key}`, "_blank");
    }, [keyDialog]);

    const handleMarkRedeemed = useCallback(() => {
        if (keyDialog.phase !== "key") return;
        redeemAction.execute({ vaultGameId: keyDialog.game.id });
        setKeyDialog({ phase: "closed" });
    }, [keyDialog, redeemAction]);

    const handleMarkUnredeemed = useCallback(() => {
        if (keyDialog.phase !== "key") return;
        unredeemAction.execute({ vaultGameId: keyDialog.game.id });
        setKeyDialog({ phase: "closed" });
    }, [keyDialog, unredeemAction]);

    const handleAuthRetry = useCallback(() => {
        if (keyDialog.phase !== "error") return;
        setSecret("");
        setKeyDialog({ phase: "auth", game: keyDialog.game });
    }, [keyDialog]);

    return {
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
        openKeyDialog,
        closeKeyDialog,
        handleAuthSubmit,
        handleCopyKey,
        handleRedeemOnSteam,
        handleMarkRedeemed,
        handleMarkUnredeemed,
        handleAuthRetry,
    };
}

