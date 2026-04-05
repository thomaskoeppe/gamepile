import { Copy, LoaderCircle, Plus } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { SubmitEvent, useState } from "react";

import {
  type ActionFeedbackState,
  ActionResultAlert,
} from "@/components/shared/action-result-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { browserLog } from "@/lib/browser-logger";
import { createInviteCode } from "@/server/actions/invite-codes";

export function InviteCodeCreateForm({
  generationEnabled,
  onCreated,
}: {
  generationEnabled: boolean;
  onCreated?: () => void;
}) {
  const [maxUsesInput, setMaxUsesInput] = useState("");
  const [expiresAtInput, setExpiresAtInput] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedbackState>({
    status: "idle",
    message: "Create an invite code for onboarding users when open signups are disabled.",
  });

  const createAction = useAction(createInviteCode, {
    onSuccess: ({ data }) => {
      if (!data?.success) {
        browserLog.error("Invite code creation failed", new Error("Creation returned unsuccessful"), {
          component: "InviteCodeCreateForm",
        });
        setFeedback({
          status: "error",
          message: "The invite code could not be created.",
          submittedAt: new Date().toISOString(),
        });
        return;
      }

      browserLog.info("Invite code created", { code: data.data.code });
      setCreatedCode(data.data.code);
      setMaxUsesInput("");
      setExpiresAtInput("");
      setFeedback({
        status: "success",
        message: `${data.message} Share ${data.data.code} with the user you want to onboard.`,
        submittedAt: new Date().toISOString(),
      });
      onCreated?.();
    },
    onError: ({ error }) => {
      setFeedback({
        status: "error",
        message: error.serverError ?? "The invite code could not be created.",
        submittedAt: new Date().toISOString(),
      });
    },
  });

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatedCode(null);

    const trimmedMaxUses = maxUsesInput.trim();
    const maxUses = trimmedMaxUses.length > 0 ? Number.parseInt(trimmedMaxUses, 10) : undefined;
    if (maxUses !== undefined && (!Number.isInteger(maxUses) || maxUses <= 0)) {
      browserLog.warn("Invite code validation failed", { field: "maxUses" });
      setFeedback({
        status: "error",
        message: "Max uses must be a positive whole number.",
        submittedAt: new Date().toISOString(),
      });
      return;
    }

    const expiresAt = expiresAtInput.trim().length > 0 ? new Date(expiresAtInput) : undefined;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      setFeedback({
        status: "error",
        message: "Expiry must be a valid date and time.",
        submittedAt: new Date().toISOString(),
      });
      return;
    }

    createAction.execute({
      maxUses,
      expiresAt,
    });
  };

  const handleCopy = async () => {
    if (!createdCode) {
      return;
    }

    browserLog.info("Invite code copied to clipboard", { code: createdCode });
    await navigator.clipboard.writeText(createdCode);
    setFeedback({
      status: "success",
      message: `Copied invite code ${createdCode} to your clipboard.`,
      submittedAt: new Date().toISOString(),
    });
  };

  return (
    <Card className="border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle>Create invite code</CardTitle>
        <CardDescription>
          Configure an optional expiry and usage limit before generating a new onboarding code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!generationEnabled ? (
          <Alert>
            <AlertTitle>Invite code generation is disabled</AlertTitle>
            <AlertDescription>
              Admins can still review existing invite code usage below, but new codes cannot be created until the
              setting is enabled in configuration.
            </AlertDescription>
          </Alert>
        ) : null}

        <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="invite-code-max-uses">Max uses</Label>
            <Input
              id="invite-code-max-uses"
              inputMode="numeric"
              min={1}
              placeholder="Unlimited"
              type="number"
              value={maxUsesInput}
              onChange={(event) => setMaxUsesInput(event.target.value)}
              disabled={createAction.isPending || !generationEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-code-expires-at">Expires at</Label>
            <Input
              id="invite-code-expires-at"
              type="datetime-local"
              value={expiresAtInput}
              onChange={(event) => setExpiresAtInput(event.target.value)}
              disabled={createAction.isPending || !generationEnabled}
            />
          </div>

          <Button type="submit" disabled={createAction.isPending || !generationEnabled}>
            {createAction.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Generate code
          </Button>
        </form>

        <ActionResultAlert state={feedback} />

        {createdCode ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Latest generated code</p>
              <p className="font-mono text-lg tracking-[0.2em] text-primary">{createdCode}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => void handleCopy()}>
              <Copy className="size-4" />
              Copy code
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

