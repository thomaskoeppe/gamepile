import { useAction } from "next-safe-action/hooks";
import { SubmitEvent, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { browserLog } from "@/lib/browser-logger";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { addUserToCollection } from "@/server/actions/collection-members";
import { addUserToVault } from "@/server/actions/vault-users";
import { getInvitableUsers } from "@/server/queries/vault-users";

import type { ResourceType } from "./types";

function getInitials(username: string): string {
  return username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function AddMemberDialog({
  isOpen,
  setIsOpen,
  resourceId,
  resourceType,
  existingUserIds,
  onMutate,
}: {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  resourceId: string;
  resourceType: ResourceType;
  existingUserIds: string[];
  onMutate?: () => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: usersResult, isInitialLoading: usersLoading } = useServerQuery(
    isOpen ? ["invitable-users", resourceType] : null,
    () => getInvitableUsers({ resourceType })
  );

  const allUsers = usersResult?.success ? usersResult.data.filter((u) => !existingUserIds.includes(u.id)) : [];
  const usersError = usersResult?.success === false ? usersResult.error : null;

  const addVaultAction = useAction(addUserToVault, {
    onSuccess: () => {
      browserLog.info("Member added to vault", { userId: selectedUserId, resourceId, resourceType });
      setIsOpen(false);
      setSelectedUserId(null);
      onMutate?.();
    },
  });
  const addCollectionAction = useAction(addUserToCollection, {
    onSuccess: () => {
      browserLog.info("Member added to collection", { userId: selectedUserId, resourceId, resourceType });
      setIsOpen(false);
      setSelectedUserId(null);
      onMutate?.();
    },
  });

  const addActionError =
    resourceType === "vault" ? addVaultAction.result?.serverError : addCollectionAction.result?.serverError;

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    browserLog.info("Add member submitted", { userId: selectedUserId, resourceId, resourceType });

    if (resourceType === "vault") {
      addVaultAction.execute({ vaultId: resourceId, userId: selectedUserId });
    } else {
      addCollectionAction.execute({ collectionId: resourceId, userId: selectedUserId });
    }
  };

  const isSubmitting = addVaultAction.isPending || addCollectionAction.isPending;
  const resourceLabel = resourceType === "vault" ? "vault" : "collection";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);

        if (!open) {
          setSelectedUserId(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-125 border-border bg-card shadow-lg">
        <DialogHeader className="text-foreground">
          <DialogTitle className="text-foreground">Add New Member</DialogTitle>
          <DialogDescription className="text-foreground">
            Only users who allow {resourceLabel} invites are shown here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {usersError && (
            <Alert variant="destructive">
              <AlertDescription>{usersError}</AlertDescription>
            </Alert>
          )}

          {addActionError && (
            <Alert variant="destructive">
              <AlertDescription>{addActionError}</AlertDescription>
            </Alert>
          )}

          <Select value={selectedUserId ?? undefined} onValueChange={(value) => setSelectedUserId(value)}>
            <SelectTrigger className="w-full" disabled={usersLoading || allUsers.length === 0}>
              <SelectValue
                placeholder={
                  usersLoading
                    ? "Loading users..."
                    : allUsers.length > 0
                      ? "Select a user to add"
                      : `No users available for ${resourceLabel} invites`
                }
              />
            </SelectTrigger>

            <SelectContent>
              {allUsers.map((user) => (
                <SelectItem key={user.id} value={user.id} className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.username} />
                    <AvatarFallback className="text-xs">{getInitials(user.username)}</AvatarFallback>
                  </Avatar>
                  <span>
                    {user.username} ({user.steamId})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !selectedUserId}>
              {isSubmitting ? "Adding..." : "Add Member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
