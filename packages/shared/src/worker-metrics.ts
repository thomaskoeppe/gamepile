export const WORKER_METRICS = {
    workersHeartbeatKey: "gamepile:metrics:workers:heartbeat",
    detailsJobsCompletedKey: "gamepile:metrics:jobs:details:completed",
    steamApiCallsKey: "gamepile:metrics:steam:api-calls",
    steamAppsFetchedKey: "gamepile:metrics:steam:apps-fetched",
    heartbeatIntervalMs: 10_000,
    workerOnlineWindowMs: 30_000,
    throughputPerSecondWindowSeconds: 60,
    throughputFiveMinutesWindowSeconds: 300,
    apiCallsPerSecondWindowSeconds: 60,
    apiCallsFiveMinutesWindowSeconds: 300,
    appsFetchedPerMinuteWindowSeconds: 60,
    throughputRetentionWindowSeconds: 300,
} as const;

export function getWorkerInstanceId(hostname: string, pid: number): string {
    return `${hostname}:${pid}`;
}


