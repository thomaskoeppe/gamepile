import { describe, expect, it } from "vitest";

import { JobStatus } from "@/prisma/generated/enums";
import { isTerminal } from "@/types/job";

describe("isTerminal", () => {
    it.each([JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED, JobStatus.FAILED, JobStatus.CANCELED])(
        "treats %s as terminal",
        (status) => {
            expect(isTerminal(status)).toBe(true);
        },
    );

    it.each([JobStatus.QUEUED, JobStatus.ACTIVE])("treats %s as in-flight", (status) => {
        // A stream that mistook these for terminal would close mid-job.
        expect(isTerminal(status)).toBe(false);
    });

    it("classifies every status in the enum", () => {
        for (const status of Object.values(JobStatus)) {
            expect(typeof isTerminal(status)).toBe("boolean");
        }
    });
});
