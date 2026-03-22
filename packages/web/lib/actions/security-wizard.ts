"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";

export type SecurityWizardState = {
  status: "idle" | "success" | "error";
  message: string;
  submittedAt: string | null;
};

const securityWizardSchema = z
  .object({
    profileName: z.string().trim().min(2, "Profile name must contain at least 2 characters."),
    authType: z.enum(["NONE", "PIN", "PASSWORD"]),
    pin: z.string().optional(),
    password: z.string().optional(),
    confirm: z.enum(["yes"]),
  })
  .superRefine((value, ctx) => {
    if (value.authType === "PIN") {
      if (!value.pin || !/^\d{4,8}$/.test(value.pin)) {
        ctx.addIssue({
          code: "custom",
          path: ["pin"],
          message: "PIN must be 4 to 8 digits.",
        });
      }
    }

    if (value.authType === "PASSWORD") {
      if (!value.password || value.password.trim().length < 8) {
        ctx.addIssue({
          code: "custom",
          path: ["password"],
          message: "Password must be at least 8 characters.",
        });
      }
    }
  });

function createState(
  status: SecurityWizardState["status"],
  message: string,
): SecurityWizardState {
  return {
    status,
    message,
    submittedAt: new Date().toISOString(),
  };
}

export async function runSecurityWizard(
  _previousState: SecurityWizardState,
  formData: FormData,
): Promise<SecurityWizardState> {
  try {
    await requireAdmin();
  } catch {
    return createState("error", "Admin access is required to run this wizard.");
  }

  const parsed = securityWizardSchema.safeParse({
    profileName: formData.get("profileName"),
    authType: formData.get("authType"),
    pin: formData.get("pin"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return createState(
      "error",
      parsed.error.issues[0]?.message ?? "Security wizard input is invalid.",
    );
  }

  const shouldFail = parsed.data.profileName.toLowerCase().includes("fail");

  if (shouldFail) {
    return createState(
      "error",
      `Simulation failed for ${parsed.data.profileName}. Try a different profile name to complete the wizard flow.`,
    );
  }

  return createState(
    "success",
    `Simulation complete for ${parsed.data.profileName}. ${parsed.data.authType} mode was applied in demo mode only.`,
  );
}

