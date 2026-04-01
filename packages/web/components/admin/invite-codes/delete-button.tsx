import { useAction } from "next-safe-action/hooks";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { browserLog } from "@/lib/browser-logger";
import { deleteInviteCode } from "@/server/actions/invite-codes";

export function DeleteInviteCodeButton({
  inviteCodeId,
  code,
  disabled,
  onDeletedAction,
}: {
  inviteCodeId: string;
  code: string;
  disabled?: boolean;
  onDeletedAction?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const deleteAction = useAction(deleteInviteCode, {
    onSuccess: () => {
      browserLog.info("Invite code deleted", { inviteCodeId, code });
      setOpen(false);
      onDeletedAction?.();
    },
  });

  return (
    <>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        Delete
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invite code {code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately invalidates the code and keeps the existing usage history for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                deleteAction.execute({ inviteCodeId });
              }}
              disabled={deleteAction.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAction.isPending ? "Deleting..." : "Delete invite code"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

