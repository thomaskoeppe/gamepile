import type { Prisma } from "@/prisma/generated/client";

export type GameDetails = Prisma.GameGetPayload<{
    include: {
        categories: { select: { id: true; name: true } };
        tags: { select: { id: true; name: true } };
        screenshots: { select: { id: true; url: true } };
        videos: { select: { id: true; url: true; title: true } };
        achievements: { select: { id: true; displayName: true; icon: true } };
        _count: { select: { achievements: true } };
    };
}>;

