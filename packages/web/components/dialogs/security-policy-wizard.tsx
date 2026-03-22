"use client";

import { CheckCircle2, LoaderCircle, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { useActionState, useCallback,useEffect, useMemo, useRef, useState } from "react";

import { ActionResultAlert } from "@/components/action-result-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runSecurityWizard } from "@/lib/actions/security-wizard";
import { browserLog } from "@/lib/browser-logger";
import { useNotifications } from "@/lib/providers/notifications";

const DEFAULT_DUMMY_ACTION_STATE = {
  status: "idle" as "idle" | "success" | "error",
  message: "",
  submittedAt: null,
};

type AuthTypeOption = "NONE" | "PIN" | "PASSWORD";

export function SecurityPolicyWizardDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [profileName, setProfileName] = useState("");
  const [authType, setAuthType] = useState<AuthTypeOption>("NONE");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [actionState, action, pending] = useActionState(
    runSecurityWizard,
    DEFAULT_DUMMY_ACTION_STATE,
  );
  const { notify } = useNotifications();
  const notifiedAtRef = useRef<string | null>(null);

  const currentStep = actionState.status === "idle" ? step : 3;

  const resetWizard = useCallback(() => {
    setStep(1);
    setProfileName("");
    setAuthType("NONE");
    setPin("");
    setPassword("");
    setLocalError(null);
    notifiedAtRef.current = null;
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    browserLog.info(nextOpen ? 'Security wizard opened' : 'Security wizard closed', { component: 'SecurityPolicyWizardDialog' });
    setOpen(nextOpen);
    if (!nextOpen) {
      resetWizard();
    }
  }, [resetWizard]);

  useEffect(() => {
    if (actionState.status === "idle" || !actionState.submittedAt) {
      return;
    }

    if (notifiedAtRef.current === actionState.submittedAt) {
      return;
    }

    notifiedAtRef.current = actionState.submittedAt;
    notify({
      type: actionState.status === "success" ? "success" : "error",
      title:
        actionState.status === "success"
          ? "Security profile simulation completed"
          : "Security profile simulation failed",
      message: actionState.message,
    });
  }, [actionState.message, actionState.status, actionState.submittedAt, notify]);

  const stepLabel = useMemo(() => {
    if (currentStep === 1) return "Step 1/3";
    if (currentStep === 2) return "Step 2/3";
    return "Step 3/3";
  }, [currentStep]);

  const handleStepOneContinue = () => {
    if (profileName.trim().length < 2) {
      browserLog.warn('Security wizard validation failed', { field: 'profileName' });
      setLocalError("Profile name must contain at least 2 characters.");
      return;
    }

    browserLog.info('Security wizard step 1 completed', { profileName, authType });
    setLocalError(null);
    setStep(2);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Sparkles className="size-4" />
          Open Security Wizard
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Security Profile Wizard</DialogTitle>
          <DialogDescription>
            Dummy 3-step flow for auth policy setup and status handling.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          {stepLabel}
        </div>

        {currentStep === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="wizard-profile-name" className="text-sm font-medium text-foreground">
                Profile name
              </label>
              <Input
                id="wizard-profile-name"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                placeholder="Example: Team Vault Policy"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Auth type</label>
              <Select value={authType} onValueChange={(value) => setAuthType(value as AuthTypeOption)}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder="Select auth type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  <SelectItem value="PIN">PIN</SelectItem>
                  <SelectItem value="PASSWORD">Password</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {localError ? (
              <p className="text-xs text-destructive">{localError}</p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleStepOneContinue}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {currentStep === 2 ? (
          <form action={action} className="space-y-4">
            <input type="hidden" name="profileName" value={profileName} />
            <input type="hidden" name="authType" value={authType} />
            <input type="hidden" name="confirm" value="yes" />

            {authType === "PIN" ? (
              <div className="space-y-2">
                <label htmlFor="wizard-pin" className="text-sm font-medium text-foreground">
                  PIN configuration
                </label>
                <Input
                  id="wizard-pin"
                  name="pin"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="4 to 8 digits"
                  autoComplete="off"
                />
              </div>
            ) : null}

            {authType === "PASSWORD" ? (
              <div className="space-y-2">
                <label htmlFor="wizard-password" className="text-sm font-medium text-foreground">
                  Password configuration
                </label>
                <Input
                  id="wizard-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="off"
                />
              </div>
            ) : null}

            {authType === "NONE" ? (
              <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                No additional configuration is required for NONE.
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Confirm
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {currentStep === 3 ? (
          <div className="space-y-4">
            <ActionResultAlert state={actionState} />

            <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
              <p>
                Profile: <span className="font-medium text-foreground">{profileName}</span>
              </p>
              <p>
                Mode: <span className="font-medium text-foreground">{authType}</span>
              </p>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                {actionState.status === "success" ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <ShieldAlert className="size-4" />
                )}
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}




