"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";

import { Header } from "@/components/header";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/lib/providers/session";
import { claimVaultShareLink } from "@/server/actions/vault-shares";

export default function ClaimSharePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    const router = useRouter();
    const { user, isLoading } = useSession();
    const [error, setError] = useState<string | null>(null);
    const claimed = useRef(false);

    useEffect(() => {
        if (isLoading || !user || claimed.current) return;
        claimed.current = true;

        (async () => {
            const result = await claimVaultShareLink({ token });
            if (result?.data?.shareId) {
                router.replace(`/vaults/shared/${result.data.shareId}`);
            } else {
                setError(result?.serverError ?? "This share link is invalid or has expired.");
            }
        })();
    }, [isLoading, user, token, router]);

    return (
        <>
            <Header />
            <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4">
                {error ? (
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center gap-3 text-center">
                            <TriangleAlert className="h-10 w-10 text-destructive" />
                            <p className="text-sm text-muted-foreground">{error}</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <LoaderCircle className="size-8 animate-spin" />
                        <p className="text-sm">Claiming your shared vault…</p>
                    </div>
                )}
            </div>
        </>
    );
}
