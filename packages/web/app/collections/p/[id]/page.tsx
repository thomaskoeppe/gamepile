import type {Metadata} from "next";
import {notFound, redirect, RedirectType} from "next/navigation";

import {ClientPage} from "@/app/collections/p/[id]/client-page";
import {getSetting} from "@/lib/app-settings";
import {consumeRateLimit, getClientIpFromHeaders, globalAuthLimiter, publicCollectionLimiter} from "@/lib/auth/rate-limit";
import {getCurrentSession} from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import {AppSettingKey, CollectionVisibility} from "@/prisma/generated/enums";

export default async function PublicCollectionPage({ params }: { params: Promise<{ id: string }>}) {
    const { id } = await params;
    const session = await getCurrentSession();

    const ip = await getClientIpFromHeaders();
    const rl = await consumeRateLimit(session ? globalAuthLimiter : publicCollectionLimiter, session ? `user:${session.user.id}` : `ip:${ip}`);
    if (!rl.success) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-muted-foreground">Too many requests. Please try again later.</p>
            </div>
        );
    }

    if (!getSetting(AppSettingKey.ALLOW_PUBLIC_COLLECTIONS)) return notFound();

    const collection = await prisma.collection.findFirst({
        where: {
            id,
            type: CollectionVisibility.PUBLIC,
        },
        include: {
            createdBy: true,
            _count: { select: { games: true } },
            users: { select: { id: true} }
        },
    });

    if (!collection) return notFound();

    if (session && (collection.createdBy.id === session.user.id || collection.users.some((u) => u.id === session.user.id))) {
        return redirect(`/collections/${id}`, RedirectType.push);
    }

    const [collectionGames, categories, genres] = await Promise.all([
        prisma.collectionGame.findMany({
            where: { collectionId: id },
            include: {
                game: {
                    include: {
                        categories: true,
                        genres: true,
                    },
                },
            },
        }),
        prisma.category.findMany({ select: { name: true } }),
        prisma.genre.findMany({ select: { name: true } }),
    ]);

    const games = collectionGames.map((cg) => ({
        ...cg.game,
        owned: false as const,
    }));

    return (
        <ClientPage
            collection={collection}
            games={games}
            categories={categories}
            genres={genres}
        />
    );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;

    const collection = await prisma.collection.findFirst({
        where: { id, type: CollectionVisibility.PUBLIC },
        select: { name: true, description: true, _count: { select: { games: true } } },
    });

    if (!collection) {
        return { title: "Collection Not Found" };
    }

    return {
        title: `${collection.name} — Gamepile`,
        description: collection.description ?? `A public collection with ${collection._count.games} games.`,
    };
}




