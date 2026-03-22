'use client';

import {ChevronDown, Gamepad2, Ticket} from "lucide-react";
import {AlertCircle} from "lucide-react";
import {useSearchParams} from "next/navigation";
import {useEffect, useState} from "react";

import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {useSession} from "@/lib/providers/session";
import {cn} from "@/lib/utils";

const ERROR_MESSAGES: Record<string, string> = {
    verification_failed: "Steam verification failed. Please try again.",
    profile_fetch_failed: "Could not fetch your Steam profile. Please try again.",
    auth_failed: "Authentication failed. Please try again.",
    login_failed: "Login process failed. Please try again.",
    session_expired: "Your session has expired. Please log in again.",
    signup_disabled: "Signups are currently disabled. Please contact support for assistance.",
    invite_codes_disabled: "Invite codes are currently disabled. Please contact support.",
    no_invite_code: "An invite code is required to sign up.",
    invalid_invite_code: "This invite code is invalid or has expired.",
};

export default function Home() {
    const { authenticated, isLoading, login } = useSession();
    const searchParams = useSearchParams();

    const error = searchParams.get("error");
    const redirect = searchParams.get("redirect") || "/library";

    const inviteCodeParam = searchParams.get("invite_code") ?? "";
    const [inviteCode, setInviteCode] = useState(inviteCodeParam);
    const [inviteOpen, setInviteOpen] = useState(
        !!inviteCodeParam || ["no_invite_code", "invalid_invite_code"].includes(error ?? "")
    );

    useEffect(() => {
        if (authenticated && !isLoading) {
            window.location.href = redirect;
        }
    }, [authenticated, isLoading, redirect]);

    const handleLogin = () => {
        login(redirect, inviteCode.trim() || undefined);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-background to-muted p-4">
            <Card className="w-full max-w-lg">
                <CardHeader className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                        <Gamepad2 className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl">Welcome Back</CardTitle>
                        <CardDescription>
                            Sign in with your Steam account to continue
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                {ERROR_MESSAGES[error] || "An error occurred. Please try again."}
                            </AlertDescription>
                        </Alert>
                    )}

                    <Button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className="w-full h-12 text-base cursor-pointer"
                        size="lg"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                             fill="currentColor" className="bi bi-steam" viewBox="0 0 16 16">
                            <path
                                d="M.329 10.333A8.01 8.01 0 0 0 7.99 16C12.414 16 16 12.418 16 8s-3.586-8-8.009-8A8.006 8.006 0 0 0 0 7.468l.003.006 4.304 1.769A2.2 2.2 0 0 1 5.62 8.88l1.96-2.844-.001-.04a3.046 3.046 0 0 1 3.042-3.043 3.046 3.046 0 0 1 3.042 3.043 3.047 3.047 0 0 1-3.111 3.044l-2.804 2a2.223 2.223 0 0 1-3.075 2.11 2.22 2.22 0 0 1-1.312-1.568L.33 10.333Z"/>
                            <path
                                d="M4.868 12.683a1.715 1.715 0 0 0 1.318-3.165 1.7 1.7 0 0 0-1.263-.02l1.023.424a1.261 1.261 0 1 1-.97 2.33l-.99-.41a1.7 1.7 0 0 0 .882.84Zm3.726-6.687a2.03 2.03 0 0 0 2.027 2.029 2.03 2.03 0 0 0 2.027-2.029 2.03 2.03 0 0 0-2.027-2.027 2.03 2.03 0 0 0-2.027 2.027m2.03-1.527a1.524 1.524 0 1 1-.002 3.048 1.524 1.524 0 0 1 .002-3.048"/>
                        </svg>
                        Sign in with Steam
                    </Button>

                    {/* Invite code collapsible */}
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => setInviteOpen((o) => !o)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none w-fit"
                        >
                            <ChevronDown
                                className={cn(
                                    "h-3.5 w-3.5 transition-transform duration-200",
                                    inviteOpen && "rotate-180"
                                )}
                            />
                            Have an invite code?
                        </button>

                        <div
                            className={cn(
                                "grid transition-all duration-200 ease-in-out",
                                inviteOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                            )}
                        >
                            <div className="overflow-hidden">
                                <div className="flex gap-2 pt-1">
                                    <div className="relative flex-1">
                                        <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                        <Input
                                            placeholder="Enter invite code"
                                            value={inviteCode}
                                            onChange={(e) => setInviteCode(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                                            className="pl-8 h-9 text-sm font-mono tracking-wide"
                                            autoComplete="off"
                                            spellCheck={false}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </CardContent>
            </Card>
        </div>
    );
}