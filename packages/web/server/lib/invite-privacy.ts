import type { Prisma } from "@/prisma/generated/client";

export const INVITE_RESOURCE_TYPES = ["vault", "collection"] as const;

export type InviteResourceType = (typeof INVITE_RESOURCE_TYPES)[number];

type InvitePrivacySettings = {
    privacyAllowVaultInvites: boolean;
    privacyAllowCollectionInvites: boolean;
} | null | undefined;

/**
 * Checks whether a user's privacy settings allow invites for the given resource type.
 * Returns `true` if settings are absent (default-open behaviour).
 *
 * @param settings - The user's `UserSettings` record, or `null`/`undefined` if not yet created.
 * @param resourceType - The type of resource being shared: `"vault"` or `"collection"`.
 * @returns `true` if the user accepts invites for this resource type.
 */
export function allowsInviteForResource(
    settings: InvitePrivacySettings,
    resourceType: InviteResourceType,
): boolean {
    if (!settings) {
        return true;
    }

    return resourceType === "vault"
        ? settings.privacyAllowVaultInvites
        : settings.privacyAllowCollectionInvites;
}

/**
 * Builds a Prisma `where` clause that restricts results to users who accept invites
 * for the given resource type. Users without a `UserSettings` record are treated as
 * accepting invites (default-open).
 *
 * @param resourceType - The type of resource: `"vault"` or `"collection"`.
 * @returns A `Prisma.UserWhereInput` fragment ready to spread into a `findMany` query.
 */
export function getInvitePrivacyFilter(resourceType: InviteResourceType): Prisma.UserWhereInput {
    return resourceType === "vault"
        ? {
            OR: [
                { settings: { is: null } },
                { settings: { is: { privacyAllowVaultInvites: true } } },
            ],
        }
        : {
            OR: [
                { settings: { is: null } },
                { settings: { is: { privacyAllowCollectionInvites: true } } },
            ],
        };
}

/**
 * Returns a user-facing error message explaining why an invite was rejected
 * due to the target user's privacy settings.
 *
 * @param resourceType - The type of resource that was being shared.
 * @returns A human-readable error string.
 */
export function getInvitePrivacyErrorMessage(resourceType: InviteResourceType): string {
    return resourceType === "vault"
        ? "This user does not allow vault invites."
        : "This user does not allow collection invites.";
}
