export const PRIORITY = {
    HIGH: 1,
    NORMAL: 5,
    LOW:  10,
} as const;

export type Priority = typeof PRIORITY[keyof typeof PRIORITY];