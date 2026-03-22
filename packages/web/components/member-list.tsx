"use client";

import {
    Calendar,
    IdCard,
    Plus,
    Shield,
    ShieldCheck,
    UserPlus,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { SubmitEvent, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { browserLog } from "@/lib/browser-logger";
import { useServerQuery } from "@/lib/hooks/use-server-query";
import { addUserToCollection, removeUserFromCollection } from "@/server/actions/collection-members";
import { addUserToVault, removeUserFromVault } from "@/server/actions/vault-users";
import { getInvitableUsers } from "@/server/queries/vault-users";

/** Base user shape shared by both vault and collection members */
interface BaseUser {
    id: string;
    steamId: string;
    username: string;
    avatarUrl: string | null;
}

export interface VaultMember extends BaseUser {
    isOwner: true;
}

export interface VaultNonOwnerMember extends BaseUser {
    isOwner: false;
    canRedeem: boolean;
    canCreate: boolean;
    addedBy: BaseUser;
    addedAt: Date;
    keyVaultUserId?: string;
}

export interface CollectionMember extends BaseUser {
    isOwner: true;
}

export interface CollectionNonOwnerMember extends BaseUser {
    isOwner: false;
    canModify: boolean;
    addedBy: BaseUser;
    addedAt: Date;
    collectionUserId?: string;
}

export type MemberUser =
    | VaultMember | VaultNonOwnerMember
    | CollectionMember | CollectionNonOwnerMember;

type ResourceType = "vault" | "collection";

interface MemberListProps {
    resourceId: string;
    resourceType: ResourceType;
    users: MemberUser[];
    isOwner: boolean;
    onMutate?: () => void;
}

function getInitials(username: string): string {
    return username.split(" ").map((n) => n[0]).join("").toUpperCase();
}

function MemberPopover({
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
            browserLog.info('Member removed from vault', { userId: user.id, username: user.username, resourceType });
            setConfirmOpen(false); onMutate?.();
        },
    });
    const removeCollectionAction = useAction(removeUserFromCollection, {
        onSuccess: () => {
            browserLog.info('Member removed from collection', { userId: user.id, username: user.username, resourceType });
            setConfirmOpen(false); onMutate?.();
        },
    });

    const handleRemove = () => {
        browserLog.info('Remove member confirmed', { userId: user.id, username: user.username, resourceType });
        if (resourceType === "vault" && !user.isOwner && "keyVaultUserId" in user && user.keyVaultUserId) {
            removeVaultAction.execute({ keyVaultUserId: user.keyVaultUserId });
        } else if (resourceType === "collection" && !user.isOwner && "collectionUserId" in user && user.collectionUserId) {
            removeCollectionAction.execute({ collectionUserId: user.collectionUserId });
        }
    };

    const isRemoving = removeVaultAction.isPending || removeCollectionAction.isPending;

    return (
        <>
            <Popover>
                <PopoverTrigger asChild>
                    <Avatar className="border-border cursor-pointer hover:scale-110 transition-transform">
                        <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.username} />
                        <AvatarFallback>{getInitials(user.username)}</AvatarFallback>
                    </Avatar>
                </PopoverTrigger>

                <PopoverContent className="w-80 bg-muted border-border shadow-lg">
                    <div className="space-y-4 py-2">
                        <div className="flex items-center gap-4">
                            <Avatar className="w-10 h-10">
                                <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.username} />
                                <AvatarFallback className="text-md">{getInitials(user.username)}</AvatarFallback>
                            </Avatar>

                            <div className="space-y-1">
                                <h3 className="font-semibold text-foreground">{user.username}</h3>
                                <div className="flex flex-wrap gap-1">
                                    {user.isOwner ? (
                                        <Badge variant="secondary">
                                            <ShieldCheck className="w-3 h-3 mr-1" /> CREATOR
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
                                                    <Shield className="w-3 h-3 mr-1" /> CAN MODIFY
                                                </Badge>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center gap-3 text-sm">
                                <IdCard className="w-4 h-4 text-foreground" />
                                <span className="text-foreground">{user.steamId}</span>
                            </div>

                            {!user.isOwner && "addedAt" in user && (
                                <>
                                    <div className="flex items-center gap-3 text-sm">
                                        <Calendar className="w-4 h-4 text-foreground" />
                                        <span className="text-foreground">
                                            Member since {new Date(user.addedAt).toLocaleDateString()}
                                        </span>
                                    </div>

                                    {"addedBy" in user && user.addedBy && (
                                        <div className="flex items-center gap-3 text-sm">
                                            <UserPlus className="w-4 h-4 text-foreground" />
                                            <span className="text-foreground">Added by </span>
                                            <Avatar className="w-5 h-5">
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
                                className="w-full bg-red-600/50 hover:bg-red-700/50 text-foreground hover:text-foreground"
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
                            {isRemoving ? "Removing…" : "Remove"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function AddMemberDialog({
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

    const {
        data: usersResult,
        isInitialLoading: usersLoading,
    } = useServerQuery(
        isOpen ? ["invitable-users", resourceType] : null,
        () => getInvitableUsers({ resourceType })
    );

    const allUsers = usersResult?.success
        ? usersResult.data.filter((u) => !existingUserIds.includes(u.id))
        : [];
    const usersError = usersResult?.success === false ? usersResult.error : null;

    const addVaultAction = useAction(addUserToVault, {
        onSuccess: () => {
            browserLog.info('Member added to vault', { userId: selectedUserId, resourceId, resourceType });
            setIsOpen(false); setSelectedUserId(null); onMutate?.();
        },
    });
    const addCollectionAction = useAction(addUserToCollection, {
        onSuccess: () => {
            browserLog.info('Member added to collection', { userId: selectedUserId, resourceId, resourceType });
            setIsOpen(false); setSelectedUserId(null); onMutate?.();
        },
    });

    const addActionError = resourceType === "vault"
        ? addVaultAction.result?.serverError
        : addCollectionAction.result?.serverError;

    const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedUserId) return;

        browserLog.info('Add member submitted', { userId: selectedUserId, resourceId, resourceType });

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
            <DialogContent className="sm:max-w-125 bg-card border-border shadow-lg">
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
                                    <Avatar className="w-6 h-6">
                                        <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.username} />
                                        <AvatarFallback className="text-xs">{getInitials(user.username)}</AvatarFallback>
                                    </Avatar>
                                    <span>{user.username} ({user.steamId})</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="flex justify-end space-x-2">
                        <Button variant="outline" type="button" onClick={() => setIsOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !selectedUserId}>
                            {isSubmitting ? "Adding…" : "Add Member"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
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
                        <div className="w-10 h-10 rounded-full bg-muted border-border flex items-center justify-center text-xs font-medium text-muted-foreground">
                            +{users.length - 8}
                        </div>
                    )}
                </div>
            </div>

            {isOwner && (
                <Button onClick={() => {
                    browserLog.info('Add member dialog opened', { resourceId, resourceType });
                    setAddDialogOpen(true);
                }} size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
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

