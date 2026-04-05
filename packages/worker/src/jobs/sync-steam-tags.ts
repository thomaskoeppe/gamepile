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

    for (let i = 0; i < tags.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = tags.slice(i, i + UPSERT_CHUNK_SIZE);

        await prisma.$transaction(
            chunk.map((t) =>
                prisma.tag.upsert({
                    where: {tagId: t.tagid},
                    create: {tagId: t.tagid, name: t.name},
                    update: {name: t.name},
                }),
            ),
        );

        upsertedCount += chunk.length;
    }

    await createLog(jobId, "info",
        `Tag sync complete. ${upsertedCount} tag(s) upserted in ${Date.now() - startMs}ms.`,
    );

    log.info("Steam tag sync completed", {upsertedCount, durationMs: Date.now() - startMs});
}
