"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { browserLog } from "@/lib/browser-logger";

import { AddMemberDialog } from "./add-member-dialog";
import { MemberPopover } from "./member-popover";
import type { MemberUser, ResourceType } from "./types";

export type {
  CollectionMember,
  CollectionNonOwnerMember,
  MemberUser,
  ResourceType,
  VaultMember,
  VaultNonOwnerMember,
} from "./types";

interface MemberListProps {
  resourceId: string;
  resourceType: ResourceType;
  users: MemberUser[];
  isOwner: boolean;
  onMutate?: () => void;
}

export function MemberList({ resourceId, resourceType, users, isOwner, onMutate }: MemberListProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const existingUserIds = users.map((u) => u.id);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          {users.slice(0, 8).map((user) => (
            <MemberPopover
              key={user.steamId}
              user={user}
              resourceType={resourceType}
              isOwner={isOwner}
              onMutate={onMutate}
            />
          ))}
          {users.length > 8 && (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-border bg-muted text-xs font-medium text-muted-foreground">
              +{users.length - 8}
            </div>
          )}
        </div>
      </div>

      {isOwner && (
        <Button
          onClick={() => {
            browserLog.info("Add member dialog opened", { resourceId, resourceType });
            setAddDialogOpen(true);
          }}
          size="sm"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Member
        </Button>
      )}

      <AddMemberDialog
        isOpen={addDialogOpen}
        setIsOpen={setAddDialogOpen}
        resourceId={resourceId}
        resourceType={resourceType}
        existingUserIds={existingUserIds}
        onMutate={onMutate}
      />
    </div>
  );
}
