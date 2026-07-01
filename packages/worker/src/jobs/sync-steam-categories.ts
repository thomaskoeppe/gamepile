import {createLog} from "@/src/lib/job/log.js";
import {logger} from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";
import {getAllCategories} from "@/src/lib/steam/cache/category-cache.js";

/** Number of categories to upsert per database transaction. */
const UPSERT_CHUNK_SIZE = 50;

/**
 * Synchronizes the local `Category` table with Steam's store categories.
 *
 * Fetches the full category list from the Steam IStoreBrowseService/GetStoreCategories API
 * (via the in-memory cache) and upserts each category into the database in chunks.
 *
 * @param opts - Job options.
 * @param opts.jobId - The database job ID tracking this sync run.
 */
export default async function syncSteamCategories(opts: { jobId: string }): Promise<void> {
    const {jobId} = opts;
    const log = logger.child("worker.jobs:syncSteamCategories", {jobId});
    const startMs = Date.now();

    log.info("Starting Steam category sync");
    await createLog(jobId, "info", "Fetching Steam store categories from IStoreBrowseService/GetStoreCategories...");

    const categories = await getAllCategories();

    log.info("Fetched Steam categories", {categoryCount: categories.length});
    await createLog(jobId, "info", `Fetched ${categories.length} categories from Steam.`);

    let upsertedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < categories.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = categories.slice(i, i + UPSERT_CHUNK_SIZE);
        const upsertOp = (c: (typeof chunk)[number]) =>
            prisma.category.upsert({
                where: {categoryId: c.categoryid},
                create: {categoryId: c.categoryid, name: c.display_name},
                update: {name: c.display_name},
            });

        try {
            await prisma.$transaction(chunk.map(upsertOp));
            upsertedCount += chunk.length;
        } catch (chunkError) {
            // One bad row poisons the whole transaction — retry the chunk
            // item by item so the rest of the sync still lands.
            log.warn("Category chunk transaction failed — retrying rows individually", {
                chunkStart: i,
                chunkSize: chunk.length,
                message: chunkError instanceof Error ? chunkError.message : String(chunkError),
            });
            for (const c of chunk) {
                try {
                    await upsertOp(c);
                    upsertedCount++;
                } catch (err) {
                    failedCount++;
                    log.warn("Failed to upsert category", {
                        categoryId: c.categoryid,
                        name: c.display_name,
                        message: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        }
    }

    if (failedCount > 0 && upsertedCount === 0) {
        throw new Error(`Category sync failed: all ${failedCount} category upsert(s) failed.`);
    }

    await createLog(jobId, failedCount > 0 ? "warn" : "info",
        `Category sync complete. ${upsertedCount} category(ies) upserted, ` +
        `${failedCount} failed in ${Date.now() - startMs}ms.`,
    );

    log.info("Steam category sync completed", {upsertedCount, failedCount, durationMs: Date.now() - startMs});
}
