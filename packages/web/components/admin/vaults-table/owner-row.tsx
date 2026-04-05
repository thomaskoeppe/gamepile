import { LoaderCircle, Trash2, UserRoundPen } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { browserLog } from "@/lib/browser-logger";
import { useAppSettings } from "@/lib/providers/app-settings";
import { changeVaultOwner, deleteVaultAsAdmin } from "@/server/actions/admin";

export interface AdminUserOption {
  id: string;
  username: string;
  steamId: string;
}

export interface AdminVaultListItem {
  id: string;
  name: string;
  authType: string;
  createdAt: string;
  owner: { id: string; username: string; steamId: string };
  memberCount: number;
  gameCount: number;
}

export function VaultOwnerRow({
  vault,
  users,
  onMutate,
}: {
  vault: AdminVaultListItem;
  users: AdminUserOption[];
  onMutate?: () => void;
}) {
  // Row-level actions include owner transfer and optional admin deletion.
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState(vault.owner.id);
  const { getSetting } = useAppSettings();
  const canDeleteAnyVault = getSetting("ADMIN_CAN_DELETE_ANY_VAULT");

  const { execute, isPending, result } = useAction(changeVaultOwner, {
    onSuccess: () => {
      browserLog.info("Vault owner changed", { vaultId: vault.id, newOwnerId: selectedOwnerId });
      setOpen(false);
      onMutate?.();
    },
  });

  const selectedOwner = users.find((user) => user.id === selectedOwnerId);

  const {
    executeAsync: executeDelete,
    isPending: isDeleting,
    result: deleteResult,
  } = useAction(deleteVaultAsAdmin);

  const handleDelete = async () => {
    const response = await executeDelete({ vaultId: vault.id });
    if (response?.data?.success) {
      browserLog.info("Vault deleted by admin", { vaultId: vault.id });
      setDeleteOpen(false);
      onMutate?.();
    }
  };

  return (
    <tr className="border-b border-border/60 align-top">
      <td className="px-4 py-3">
        <p className="font-medium text-foreground">{vault.name}</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{vault.id}</p>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{vault.authType}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{vault.gameCount}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{vault.memberCount}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {new Date(vault.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="space-y-2">
          <p className="text-sm text-foreground">{vault.owner.username}</p>
          <p className="font-mono text-xs text-muted-foreground">{vault.owner.steamId}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <UserRoundPen className="size-4" />
                Change owner
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Vault Owner</DialogTitle>
                <DialogDescription>
                  Select a new owner for <span className="font-medium text-foreground">{vault.name}</span>.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder="Select new owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.username} ({user.steamId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                  New owner: <span className="font-medium text-foreground">{selectedOwner?.username ?? "Unknown"}</span>
                </div>

                {result?.serverError && <p className="text-xs text-destructive">{result.serverError}</p>}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => execute({ vaultId: vault.id, ownerId: selectedOwnerId })}
                    disabled={isPending}
                  >
                    {isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
                    Confirm owner change
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

          {canDeleteAnyVault && (
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Vault</DialogTitle>
                  <DialogDescription>
                    Delete <span className="font-medium text-foreground">{vault.name}</span>? This cannot be undone.
                  </DialogDescription>
                </DialogHeader>

                {deleteResult?.serverError && (
                  <p className="text-xs text-destructive">{deleteResult.serverError}</p>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" disabled={isDeleting} onClick={handleDelete}>
                    {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                    Delete vault
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </td>
    </tr>
  );
}

