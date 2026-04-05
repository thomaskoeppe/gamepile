"use client";

import {TriangleAlert} from "lucide-react";
import { useParams } from "next/navigation";

import {Collection} from "@/app/collections/[id]/collection";
import { Header } from "@/components/header";
import { Card, CardContent } from "@/components/ui/card";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { useSession } from "@/lib/providers/session";
import {checkCollectionAccess} from "@/server/queries/collections";

export default function Page() {
    const { id } = useParams<{ id: string }>();
    const { user } = useSession();

    const {
        data: accessResult
    } = useServerQuery(
        user ? ["collection-access", id, user.id] : null,
        () => checkCollectionAccess({ collectionId: id })
    );

    const accessStatus = accessResult?.success ? accessResult.data : null;

    if (!accessStatus) {
        return (
            <>
                <Header />

                <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 overflow-hidden">
                    <Card className="bg-card border-destructive/50">
                        <CardContent className="flex flex-col items-center gap-3 text-center">
                            <TriangleAlert className="h-10 w-10 text-destructive" />
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">Collection not found</h2>
                                <p className="text-sm text-muted-foreground mt-1">
                                    This collection does not exist or you don not have access to it.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </>
        );
    }

    return (<Collection collectionId={id} />);
}