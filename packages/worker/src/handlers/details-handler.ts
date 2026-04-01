import type { Job } from "bullmq";

import fetchGameDetails from "@/src/jobs/fetch-game-details.js";
import type { GameDetailsQueuePayload } from "@/src/lib/job/queue.js";

export async function handleDetailsJob(job: Job<GameDetailsQueuePayload>) {
    await fetchGameDetails(job);
}

