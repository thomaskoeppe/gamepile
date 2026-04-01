import { Calendar, IdCard, Shield, ShieldCheck, UserPlus } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { browserLog } from "@/lib/browser-logger";
import { removeUserFromCollection } from "@/server/actions/collection-members";
import { removeUserFromVault } from "@/server/actions/vault-users";

import type { MemberUser, ResourceType } from "./types";

function getInitials(username: string): string {
  return username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function MemberPopover({
  user,
  resourceType,
  isOwner: viewerIsOwner,
  onMutate,
}: {
  user: MemberUser;
  resourceType: ResourceType;
  isOwner: boolean;
  onMutate?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const removeVaultAction = useAction(removeUserFromVault, {
    onSuccess: () => {
      browserLog.info("Member removed from vault", { userId: user.id, username: user.username, resourceType });
      setConfirmOpen(false);
      onMutate?.();
    },
  });
  const removeCollectionAction = useAction(removeUserFromCollection, {
    onSuccess: () => {
      browserLog.info("Member removed from collection", { userId: user.id, username: user.username, resourceType });
      setConfirmOpen(false);
      onMutate?.();
    },
  });

  const handleRemove = () => {
    browserLog.info("Remove member confirmed", { userId: user.id, username: user.username, resourceType });
    if (resourceType === "vault" && !user.isOwner && "keyVaultUserId" in user && user.keyVaultUserId) {
      removeVaultAction.execute({ keyVaultUserId: user.keyVaultUserId });
    } else if (
      resourceType === "collection" &&
      !user.isOwner &&
      "collectionUserId" in user &&
      user.collectionUserId
    ) {
      removeCollectionAction.execute({ collectionUserId: user.collectionUserId });
    }
  };

  const isRemoving = removeVaultAction.isPending || removeCollectionAction.isPending;

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Avatar className="cursor-pointer border-border transition-transform hover:scale-110">
            <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.username} />
            <AvatarFallback>{getInitials(user.username)}</AvatarFallback>
          </Avatar>
        </PopoverTrigger>

        <PopoverContent className="w-80 border-border bg-muted shadow-lg">
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-4">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.username} />
                <AvatarFallback className="text-md">{getInitials(user.username)}</AvatarFallback>
              </Avatar>

              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">{user.username}</h3>
                <div className="flex flex-wrap gap-1">
                  {user.isOwner ? (
                    <Badge variant="secondary">
                      <ShieldCheck className="mr-1 h-3 w-3" /> CREATOR
                    </Badge>
                  ) : (
                    <>
                      {resourceType === "vault" && "canCreate" in user && user.canCreate && (
                        <Badge variant="secondary">CAN CREATE</Badge>
                      )}
                      {resourceType === "vault" && "canRedeem" in user && user.canRedeem && (
                        <Badge variant="secondary">CAN REDEEM</Badge>
                      )}
                      {resourceType === "collection" && "canModify" in user && user.canModify && (
                        <Badge variant="secondary">
                          <Shield className="mr-1 h-3 w-3" /> CAN MODIFY
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <IdCard className="h-4 w-4 text-foreground" />
                <span className="text-foreground">{user.steamId}</span>
              </div>

              {!user.isOwner && "addedAt" in user && (
                <>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-foreground" />
                    <span className="text-foreground">Member since {new Date(user.addedAt).toLocaleDateString()}</span>
                  </div>

                  {"addedBy" in user && user.addedBy && (
                    <div className="flex items-center gap-3 text-sm">
                      <UserPlus className="h-4 w-4 text-foreground" />
                      <span className="text-foreground">Added by </span>
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={user.addedBy.avatarUrl || "/placeholder.svg"} alt={user.addedBy.username} />
                        <AvatarFallback className="text-xs">{getInitials(user.addedBy.username)}</AvatarFallback>
                      </Avatar>
                      <span className="text-foreground">{user.addedBy.username}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {viewerIsOwner && !user.isOwner && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full bg-red-600/50 text-foreground hover:bg-red-700/50 hover:text-foreground"
                onClick={() => setConfirmOpen(true)}
              >
                Remove Member
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {user.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {user.username} from this {resourceType}. They will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
