/**
 * Numeric priority levels for BullMQ jobs.
 *
 * Lower numbers indicate higher priority. Used when enqueuing
 * game-detail fetch jobs to prioritize user-connected games.
 */
export const PRIORITY = {
    /** Highest priority — used for user-initiated library imports. */
    HIGH: 1,
    /** Default priority — used for connected games during catalog sync. */
    NORMAL: 5,
    /** Lowest priority — used for unconnected games during catalog sync. */
    LOW:  10,
} as const;

/**
 * Union type of valid BullMQ priority values.
 */
export type Priority = typeof PRIORITY[keyof typeof PRIORITY];