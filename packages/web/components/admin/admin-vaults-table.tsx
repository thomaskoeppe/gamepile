import { LoaderCircle, UserRoundPen } from "lucide-react";
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
import { changeVaultOwner } from "@/server/actions/admin";

interface AdminUserOption {
  id: string;
  username: string;
  steamId: string;
}

interface AdminVaultListItem {
  id: string;
  name: string;
  authType: string;
  createdAt: string;
  owner: { id: string; username: string; steamId: string };
  memberCount: number;
  gameCount: number;
}

function VaultOwnerRow({
  vault,
  users,
  onMutate,
}: {
  vault: AdminVaultListItem;
  users: AdminUserOption[];
  onMutate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState(vault.owner.id);

  const { execute, isPending, result } = useAction(changeVaultOwner, {
    onSuccess: () => {
      browserLog.info('Vault owner changed', { vaultId: vault.id, newOwnerId: selectedOwnerId });
      setOpen(false);
      onMutate?.();
    },
  });

  const selectedOwner = users.find((user) => user.id === selectedOwnerId);

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
                Select a new owner for{" "}
                <span className="font-medium text-foreground">{vault.name}</span>.
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
                New owner:{" "}
                <span className="font-medium text-foreground">
                  {selectedOwner?.username ?? "Unknown"}
                </span>
              </div>

              {result?.serverError && (
                <p className="text-xs text-destructive">{result.serverError}</p>
              )}

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
      </td>
    </tr>
  );
}

export function AdminVaultsTable({
  vaults,
  users,
  onMutate,
}: {
  vaults: AdminVaultListItem[];
  users: AdminUserOption[];
  onMutate?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/95">
        <table className="w-full text-sm">
          <thead className="bg-background/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Vault</th>
              <th className="px-4 py-3">Auth</th>
              <th className="px-4 py-3">Games</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Current owner</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vaults.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  No vaults found.
                </td>
              </tr>
            ) : (
              vaults.map((vault) => (
                <VaultOwnerRow key={vault.id} vault={vault} users={users} onMutate={onMutate} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
