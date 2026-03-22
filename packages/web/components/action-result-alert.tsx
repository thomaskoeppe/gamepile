import { AlertCircle, CheckCircle2, Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type ActionFeedbackState = {
  status: "idle" | "success" | "error";
  message: string;
  submittedAt?: string | null;
};

interface ActionResultAlertProps {
  state: ActionFeedbackState;
  idleTitle?: string;
  idleMessage?: string;
  className?: string;
}

export function ActionResultAlert({
  state,
  idleTitle,
  idleMessage,
  className,
}: ActionResultAlertProps) {
  if (state.status === "idle") {
    if (!idleMessage) {
      return null;
    }

    return (
      <Alert className={cn("border-border/60", className)}>
        <Info className="size-4" />
        {idleTitle ? <AlertTitle>{idleTitle}</AlertTitle> : null}
        <AlertDescription>{idleMessage}</AlertDescription>
      </Alert>
    );
  }

  const isError = state.status === "error";
  const submittedAt = state.submittedAt
    ? new Date(state.submittedAt).toLocaleString()
    : null;

  return (
    <Alert
      variant={isError ? "destructive" : "default"}
      className={cn(!isError && "border-primary/30", className)}
    >
      {isError ? (
        <AlertCircle className="size-4" />
      ) : (
        <CheckCircle2 className="size-4 text-primary" />
      )}
      <AlertTitle>{isError ? "Action failed" : "Action completed"}</AlertTitle>
      <AlertDescription>
        <p>{state.message}</p>
        {submittedAt ? (
          <p className="text-xs text-muted-foreground">Last update: {submittedAt}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

