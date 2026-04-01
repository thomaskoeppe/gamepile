"use client";

import { Eye, EyeOff, Loader2,Lock } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import {SubmitEvent,useState} from "react";

import { Button } from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KeyVaultAuthType } from "@/prisma/generated/browser";
import { authenticateVault } from "@/server/actions/vaults/auth";

interface VaultAuthGateProps {
    vaultId: string;
    vaultName: string;
    authType: KeyVaultAuthType;
    onSuccess?: () => void;
}

export function VaultAuthGate({ vaultId, vaultName, authType, onSuccess }: VaultAuthGateProps) {
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const isPin = authType === KeyVaultAuthType.PIN;

    const { execute, isPending, result } = useAction(authenticateVault, {
        onSuccess: () => {
            onSuccess?.();
        },
    });

    const serverError = result?.serverError;

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        execute({ vaultId, secret: password });
    }

    return (
        <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 overflow-hidden">
            <Card>
                <CardContent className="flex flex-col items-center gap-6 text-center">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="flex items-center justify-center">
                            <Lock className="h-10 w-10 text-primary" />
                        </div>

                        <div>
                            <h2 className="text-lg font-semibold text-foreground">{vaultName}</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {isPin
                                    ? "Enter your PIN to access this vault"
                                    : "Enter your password to access this vault"}
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative">
                            {isPin ? (
                                    <div className="relative">
                                        <Input
                                            name="pin"
                                            autoComplete={"one-time-code"}
                                            type={"text"}
                                            inputMode="numeric"
                                            maxLength={6}
                                            pattern="[0-9]*"
                                            placeholder="Enter PIN"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))}
                                            className="bg-muted border-border text-center text-xl tracking-widest focus-visible:border-primary focus-visible:ring-rin w-100"
                                            disabled={isPending}
                                            aria-invalid={!!serverError}
                                            autoFocus
                                        />
                                    </div>
                            ) : (
                                <div className="relative">
                                    <Input
                                        name="password"
                                        autoComplete={"current-password"}
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="bg-muted border-border pr-10 focus-visible:border-primary focus-visible:ring-ring w-100"
                                        disabled={isPending}
                                        aria-invalid={!!serverError}
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            )}
                        </div>

                        {serverError && (
                            <p className="text-xs text-destructive text-center">{serverError}</p>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isPending || password.length === 0}
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Verifying…
                                </>
                            ) : (
                                "Unlock Vault"
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
