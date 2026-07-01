import {createLog} from "@/src/lib/job/log.js";
import {logger} from "@/src/lib/logger.js";
import prisma from "@/src/lib/prisma.js";
import {getAllTags} from "@/src/lib/steam/cache/tag-cache.js";

/** Number of tags to upsert per database transaction. */
const UPSERT_CHUNK_SIZE = 200;

/**
 * Synchronizes the local `Tag` table with Steam's tag list.
 *
 * Fetches the full tag list from the Steam IStoreService/GetTagList API
 * (via the in-memory cache) and upserts each tag into the database in chunks.
 *
 * @param opts - Job options.
 * @param opts.jobId - The database job ID tracking this sync run.
 */
export default async function syncSteamTags(opts: { jobId: string }): Promise<void> {
    const {jobId} = opts;
    const log = logger.child("worker.jobs:syncSteamTags", {jobId});
    const startMs = Date.now();

    log.info("Starting Steam tag sync");
    await createLog(jobId, "info", "Fetching Steam tag list from IStoreService/GetTagList...");

    const tags = await getAllTags();

    log.info("Fetched Steam tags", {tagCount: tags.length});
    await createLog(jobId, "info", `Fetched ${tags.length} tags from Steam.`);

    let upsertedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < tags.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = tags.slice(i, i + UPSERT_CHUNK_SIZE);
        const upsertOp = (t: (typeof chunk)[number]) =>
            prisma.tag.upsert({
                where: {tagId: t.tagid},
                create: {tagId: t.tagid, name: t.name},
                update: {name: t.name},
            });

        try {
            await prisma.$transaction(chunk.map(upsertOp));
            upsertedCount += chunk.length;
        } catch (chunkError) {
            // One bad row poisons the whole transaction — retry the chunk
            // item by item so the rest of the sync still lands.
            log.warn("Tag chunk transaction failed — retrying rows individually", {
                chunkStart: i,
                chunkSize: chunk.length,
                message: chunkError instanceof Error ? chunkError.message : String(chunkError),
            });
            for (const t of chunk) {
                try {
                    await upsertOp(t);
                    upsertedCount++;
                } catch (err) {
                    failedCount++;
                    log.warn("Failed to upsert tag", {
                        tagId: t.tagid,
                        name: t.name,
                        message: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        }
    }

    if (failedCount > 0 && upsertedCount === 0) {
        throw new Error(`Tag sync failed: all ${failedCount} tag upsert(s) failed.`);
    }

    await createLog(jobId, failedCount > 0 ? "warn" : "info",
        `Tag sync complete. ${upsertedCount} tag(s) upserted, ` +
        `${failedCount} failed in ${Date.now() - startMs}ms.`,
    );

    log.info("Steam tag sync completed", {upsertedCount, failedCount, durationMs: Date.now() - startMs});
}
