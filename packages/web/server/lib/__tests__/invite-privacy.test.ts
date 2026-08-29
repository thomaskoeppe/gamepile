import { describe, expect, it } from "vitest";

import {
    allowsInviteForResource,
    getInvitePrivacyErrorMessage,
    getInvitePrivacyFilter,
    INVITE_RESOURCE_TYPES,
} from "@/server/lib/invite-privacy";

describe("allowsInviteForResource", () => {
    it.each(INVITE_RESOURCE_TYPES)("defaults to open when the user has no settings row (%s)", (type) => {
        expect(allowsInviteForResource(null, type)).toBe(true);
        expect(allowsInviteForResource(undefined, type)).toBe(true);
    });

    it("reads the vault flag for vault invites", () => {
        const settings = { privacyAllowVaultInvites: false, privacyAllowCollectionInvites: true };

        expect(allowsInviteForResource(settings, "vault")).toBe(false);
        expect(allowsInviteForResource(settings, "collection")).toBe(true);
    });

    it("reads the collection flag for collection invites", () => {
        const settings = { privacyAllowVaultInvites: true, privacyAllowCollectionInvites: false };

        expect(allowsInviteForResource(settings, "collection")).toBe(false);
        expect(allowsInviteForResource(settings, "vault")).toBe(true);
    });
});

describe("getInvitePrivacyFilter", () => {
    it("includes users with no settings row so the default stays open", () => {
        for (const type of INVITE_RESOURCE_TYPES) {
            expect(getInvitePrivacyFilter(type).OR).toContainEqual({ settings: { is: null } });
        }
    });

    it("filters on the flag matching the resource type", () => {
        expect(getInvitePrivacyFilter("vault").OR).toContainEqual({
            settings: { is: { privacyAllowVaultInvites: true } },
        });
        expect(getInvitePrivacyFilter("collection").OR).toContainEqual({
            settings: { is: { privacyAllowCollectionInvites: true } },
        });
    });
});

describe("getInvitePrivacyErrorMessage", () => {
    it("names the resource type without revealing the target's settings", () => {
        expect(getInvitePrivacyErrorMessage("vault")).toBe("This user does not allow vault invites.");
        expect(getInvitePrivacyErrorMessage("collection")).toBe("This user does not allow collection invites.");
    });
});
