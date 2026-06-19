import type {StoreBrowseDetails} from "@/src/lib/steam/api/types.js";
import {getAllCategories} from "@/src/lib/steam/cache/category-cache.js";
import {createLog} from "@/src/lib/job/log.js";
import {logger} from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";
import {GameType} from "@/src/prisma/generated/enums.js";

const log = logger.child("worker.jobs:gamePersistence");

/**
 * Records a permanently failed child job in the database and increments
 * the parent job's `failedItems` counter.
 *
 * Also writes a warning log entry to the parent job's log stream.
 *
 * @param parentJobId - UUID of the parent job.
 * @param appId - Steam application ID that failed.
 * @param gameId - Internal game UUID, or `undefined` if not known.
 * @param errorMessage - Human-readable error description.
 * @param attempts - Number of attempts made before permanent failure.
 */
export async function recordChildFailure(
    parentJobId: string,
    appId: number,
    gameId: string | undefined,
    errorMessage: string,
    attempts: number,
): Promise<void> {
    await prisma.failedChildJob.create({
        data: {jobId: parentJobId, appId, gameId, errorMessage, attempts},
    });

    await prisma.job.update({
        where: {id: parentJobId},
        data: {failedItems: {increment: 1}},
    });

    await createLog(
        parentJobId, "warn",
        `appId=${appId} permanently failed after ${attempts} attempt(s): ${errorMessage}`,
    );

    log.warn("Recorded child job failure", {parentJobId, appId, gameId, errorMessage, attempts});
}

/**
 * Increments the `processedItems` counter on a parent job record.
 *
 * @param parentJobId - UUID of the parent job.
 * @param count - Number of items to add to the counter.
 */
export async function incrementProcessedItems(parentJobId: string, count: number): Promise<void> {
    await prisma.job.update({
        where: {id: parentJobId},
        data: {processedItems: {increment: count}},
    });
}

/**
 * Ensures all referenced Steam categories exist as `Category` rows in the database.
 *
 * Resolves category IDs against the in-memory category cache and bulk-creates
 * any that are missing, skipping duplicates.
 *
 * @param categoryIds - Array of Steam category IDs to ensure.
 */
async function ensureCategoriesExist(categoryIds: number[]): Promise<void> {
    if (categoryIds.length === 0) return;

    const allCategories = await getAllCategories();
    const categoryMap = new Map(allCategories.map((c) => [c.categoryid, c]));

    const toCreate = categoryIds
        .map((id) => categoryMap.get(id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined)
        .map((c) => ({categoryId: c.categoryid, name: c.display_name}));

    if (toCreate.length > 0) {
        await prisma.category.createMany({data: toCreate, skipDuplicates: true});
    }
}

/**
 * Ensures all referenced Steam tags exist as `Tag` rows in the database.
 *
 * Bulk-creates tag records, skipping duplicates. Uses tag names from the
 * corresponding position in the `tagNames` array.
 *
 * @param tagIds - Array of Steam tag IDs to ensure.
 * @param tagNames - Array of resolved tag names (parallel to `tagIds`).
 */
async function ensureTagsExist(tagIds: number[], tagNames: string[]): Promise<void> {
    if (tagIds.length === 0) return;

    const toCreate = tagIds.map((tagId, i) => ({
        tagId,
        name: tagNames[i] ?? `Tag ${tagId}`,
    }));

    await prisma.tag.createMany({data: toCreate, skipDuplicates: true});
}

/**
 * Persists full game details from the Steam Store API into the database.
 *
 * Creates or updates the `Game` record along with its category and tag
 * associations. If a `gameId` is provided, performs a direct update;
 * otherwise, upserts by `appId`.
 *
 * @param details - Normalised game details from the Steam Store API.
 * @param gameId - Internal game UUID if known (for direct update), or `undefined` (for upsert by appId).
 */
export async function persistGameDetails(
    details: StoreBrowseDetails,
    gameId: string | undefined,
): Promise<void> {
    await ensureCategoriesExist(details.categoryIds);
    await ensureTagsExist(details.tagIds, details.tagNames);

    const [existingCategories, existingTags] = await prisma.$transaction([
        prisma.category.findMany({
            where: details.categoryIds.length > 0
                ? {categoryId: {in: details.categoryIds}}
                : {id: "none"},
        }),
        prisma.tag.findMany({
            where: details.tagIds.length > 0
                ? {tagId: {in: details.tagIds}}
                : {id: "none"},
        }),
    ]);

    const sharedFields = {
        name: details.name,
        type: details.type,
        isFree: details.isFree,
        isEarlyAccess: details.isEarlyAccess,
        shortDescription: details.shortDescription,
        fullDescription: details.fullDescription,
        developers: details.developers,
        publishers: details.publishers,
        franchises: details.franchises,
        releaseDate: details.releaseDate,
        platforms: details.platforms,
        headerImageUrl: details.headerImageUrl,
        capsuleImageUrl: details.capsuleImageUrl,
        libraryCapsuleUrl: details.libraryCapsuleUrl,
        libraryHeroUrl: details.libraryHeroUrl,
        heroCapsuleUrl: details.heroCapsuleUrl,
        reviewScore: details.reviewScore,
        reviewPercentage: details.reviewPercentage,
        reviewCount: details.reviewCount,
        reviewScoreLabel: details.reviewScoreLabel,
        steamDeckCompat: details.steamDeckCompat,
        detailsFetchedAt: details.detailsFetchedAt,
    };

    const categoryConnect = existingCategories.map((c) => ({id: c.id}));
    const tagConnect = existingTags.map((t) => ({id: t.id}));

    let resolvedGameId = gameId;
    if (resolvedGameId) {
        const exists = await prisma.game.findUnique({
            where: {id: resolvedGameId},
            select: {id: true},
        });

        if (!exists) {
            log.warn("Game record not found for gameId — falling back to upsert by appId", {
                gameId: resolvedGameId, appId: details.appId,
            });
            resolvedGameId = undefined;
        }
    }

    if (resolvedGameId) {
        await prisma.game.update({
            where: {id: resolvedGameId},
            data: {
                ...sharedFields,
                ...(categoryConnect.length > 0 ? {categories: {set: categoryConnect}} : {}),
                ...(tagConnect.length > 0 ? {tags: {set: tagConnect}} : {}),
            },
        });

        await persistMedia(resolvedGameId, details);
    } else {
        const game = await prisma.game.upsert({
            where: {appId: details.appId},
            create: {
                ...sharedFields,
                appId: details.appId,
                ...(categoryConnect.length > 0 ? {categories: {connect: categoryConnect}} : {}),
                ...(tagConnect.length > 0 ? {tags: {connect: tagConnect}} : {}),
            },
            update: {
                ...sharedFields,
                ...(categoryConnect.length > 0 ? {categories: {set: categoryConnect}} : {}),
                ...(tagConnect.length > 0 ? {tags: {set: tagConnect}} : {}),
            },
            select: {id: true},
        });

        await persistMedia(game.id, details);
    }
}

/**
 * Synchronises a game's screenshots and videos with fresh data from the Steam API.
 *
 * Instead of unconditionally deleting and recreating every media row on each
 * refresh (which produced heavy, mostly-redundant write load — see issue #94),
 * this reads the current rows, diffs them against the incoming payload, and only
 * writes the delta: it inserts new URLs, deletes URLs that disappeared, and
 * updates a video's title when it changed. When nothing changed — the common
 * case on a periodic refresh — no transaction is opened and no rows are touched.
 *
 * Screenshots and videos are keyed by `url` (unique per game via
 * `@@unique([gameId, url])`).
 *
 * @param gameId - Internal game UUID.
 * @param details - Normalised game details containing screenshot URLs and trailer data.
 */
async function persistMedia(gameId: string, details: StoreBrowseDetails): Promise<void> {
    const [existingScreenshots, existingVideos] = await prisma.$transaction([
        prisma.gameScreenshot.findMany({where: {gameId}, select: {id: true, url: true}}),
        prisma.gameVideo.findMany({where: {gameId}, select: {id: true, url: true, title: true}}),
    ]);

    // Screenshots — identity is the URL.
    const existingScreenshotUrls = new Set(existingScreenshots.map((s) => s.url));
    const incomingScreenshotUrls = new Set(details.screenshotUrls);

    const screenshotsToInsert = details.screenshotUrls
        .filter((url) => !existingScreenshotUrls.has(url))
        .map((url) => ({gameId, url}));
    const screenshotIdsToDelete = existingScreenshots
        .filter((s) => !incomingScreenshotUrls.has(s.url))
        .map((s) => s.id);

    // Videos — identity is the URL; the title may change for an existing URL.
    const existingVideoByUrl = new Map(existingVideos.map((v) => [v.url, v]));
    const incomingVideoUrls = new Set(details.trailers.map((t) => t.url));

    const videosToInsert = details.trailers
        .filter((t) => !existingVideoByUrl.has(t.url))
        .map((t) => ({gameId, url: t.url, title: t.title}));
    const videoIdsToDelete = existingVideos
        .filter((v) => !incomingVideoUrls.has(v.url))
        .map((v) => v.id);
    const videoTitleUpdates = details.trailers.flatMap((t) => {
        const existing = existingVideoByUrl.get(t.url);
        if (existing && (existing.title ?? null) !== (t.title ?? null)) {
            return [{id: existing.id, title: t.title}];
        }
        return [];
    });

    const hasChanges =
        screenshotsToInsert.length > 0
        || screenshotIdsToDelete.length > 0
        || videosToInsert.length > 0
        || videoIdsToDelete.length > 0
        || videoTitleUpdates.length > 0;

    if (!hasChanges) {
        return;
    }

    await prisma.$transaction([
        ...(screenshotIdsToDelete.length > 0
            ? [prisma.gameScreenshot.deleteMany({where: {id: {in: screenshotIdsToDelete}}})]
            : []),
        ...(videoIdsToDelete.length > 0
            ? [prisma.gameVideo.deleteMany({where: {id: {in: videoIdsToDelete}}})]
            : []),
        ...(screenshotsToInsert.length > 0
            ? [prisma.gameScreenshot.createMany({data: screenshotsToInsert, skipDuplicates: true})]
            : []),
        ...(videosToInsert.length > 0
            ? [prisma.gameVideo.createMany({data: videosToInsert, skipDuplicates: true})]
            : []),
        ...videoTitleUpdates.map((u) =>
            prisma.gameVideo.update({where: {id: u.id}, data: {title: u.title}})),
    ]);
}

/**
 * Creates or updates a minimal stub record for a game that Steam did not return details for.
 *
 * The stub uses `GameType.UNKNOWN` and sets `detailsFetchedAt` to prevent
 * the game from being re-queued immediately.
 *
 * @param appId - Steam application ID.
 * @param gameId - Internal game UUID if known (for direct update), or `undefined` (for upsert by appId).
 */
export async function createGameStub(appId: number, gameId: string | undefined): Promise<void> {
    const stubFields = {
        name: `App ${appId}`,
        type: GameType.UNKNOWN,
        detailsFetchedAt: new Date(),
    };

    let resolvedId = gameId;
    if (resolvedId) {
        const exists = await prisma.game.findUnique({
            where: {id: resolvedId},
            select: {id: true},
        });
        if (!exists) {
            log.warn("Game record not found for stub gameId — falling back to upsert by appId", {
                gameId: resolvedId, appId,
            });
            resolvedId = undefined;
        }
    }

    if (resolvedId) {
        await prisma.game.update({where: {id: resolvedId}, data: stubFields});
    } else {
        await prisma.game.upsert({
            where: {appId},
            create: {...stubFields, appId},
            update: stubFields,
        });
    }
}
