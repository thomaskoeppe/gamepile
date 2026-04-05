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

    for (let i = 0; i < categories.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = categories.slice(i, i + UPSERT_CHUNK_SIZE);

        await prisma.$transaction(
            chunk.map((c) =>
                prisma.category.upsert({
                    where: {categoryId: c.categoryid},
                    create: {categoryId: c.categoryid, name: c.display_name},
                    update: {name: c.display_name},
                }),
            ),
        );

        upsertedCount += chunk.length;
    }

    await createLog(jobId, "info",
        `Category sync complete. ${upsertedCount} category(ies) upserted in ${Date.now() - startMs}ms.`,
    );

    log.info("Steam category sync completed", {upsertedCount, durationMs: Date.now() - startMs});
}
