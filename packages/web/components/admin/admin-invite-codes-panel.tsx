import { Copy, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { SubmitEvent, useMemo, useState } from "react";

import { type ActionFeedbackState,ActionResultAlert } from "@/components/action-result-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { browserLog } from "@/lib/browser-logger";
import { createInviteCode, deleteInviteCode } from "@/server/actions/invite-codes";
import type { AdminInviteCodesData } from "@/server/queries/invite-codes";

function formatDateTime(value: string | null): string {
    if (!value) {
        return "Never";
    }

    return new Date(value).toLocaleString();
}

function SummaryCard({ title, value, description }: { title: string; value: string | number; description: string }) {
    return (
        <Card className="border-border/70 bg-card/95">
            <CardHeader className="pb-2">
                <CardDescription>{title}</CardDescription>
                <CardTitle className="text-3xl">{value}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">{description}</p>
            </CardContent>
        </Card>
    );
}

function DeleteInviteCodeButton({
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
            browserLog.info('Invite code deleted', { inviteCodeId, code });
            setOpen(false);
            onDeletedAction?.();
        },
    });

    return (
        <>
            <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
                <Trash2 className="size-4" />
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
                            {deleteAction.isPending ? "Deleting…" : "Delete invite code"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function InviteCodeCreateForm({
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
                browserLog.error('Invite code creation failed', new Error('Creation returned unsuccessful'), { component: 'InviteCodeCreateForm' });
                setFeedback({
                    status: "error",
                    message: "The invite code could not be created.",
                    submittedAt: new Date().toISOString(),
                });
                return;
            }

            browserLog.info('Invite code created', { code: data.data.code });
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
            browserLog.warn('Invite code validation failed', { field: 'maxUses' });
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

        browserLog.info('Invite code copied to clipboard', { code: createdCode });
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
                            Admins can still review existing invite code usage below, but new codes cannot be created until the setting is enabled in configuration.
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

export function AdminInviteCodesPanel({
    data,
    onMutate,
}: {
    data: AdminInviteCodesData;
    onMutate?: () => void;
}) {
    const sortedCodes = useMemo(() => data.codes, [data.codes]);

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard
                    title="Total codes"
                    value={data.summary.totalCodes}
                    description="Invite codes that exist in the system, including expired and exhausted codes."
                />
                <SummaryCard
                    title="Usable codes"
                    value={data.summary.activeCodes}
                    description="Codes that are not expired and still have remaining uses."
                />
                <SummaryCard
                    title="Total redemptions"
                    value={data.summary.totalUsages}
                    description="How many user signups were completed through invite codes."
                />
            </div>

            <InviteCodeCreateForm generationEnabled={data.generationEnabled} onCreated={onMutate} />

            <Card className="border-border/70 bg-card/95">
                <CardHeader>
                    <CardTitle>Existing invite codes</CardTitle>
                    <CardDescription>
                        Review creation metadata, remaining capacity, and the users who redeemed each code.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Usage</TableHead>
                                <TableHead>Redeemed by</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedCodes.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                        No invite codes have been generated yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                sortedCodes.map((inviteCode) => (
                                    <TableRow key={inviteCode.id}>
                                        <TableCell className="align-top">
                                            <div className="space-y-2">
                                                <p className="font-mono text-sm tracking-[0.2em] text-foreground">{inviteCode.code}</p>
                                                <div className="space-y-1 text-xs text-muted-foreground">
                                                    <p>Created by {inviteCode.createdBy.username}</p>
                                                    <p>{inviteCode.createdBy.steamId}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="flex flex-wrap gap-2">
                                                <Badge variant={inviteCode.isAvailable ? "default" : "secondary"}>
                                                    {inviteCode.isAvailable ? "Usable" : "Unavailable"}
                                                </Badge>
                                                {inviteCode.isExpired ? <Badge variant="destructive">Expired</Badge> : null}
                                                {inviteCode.remainingUses === 0 ? <Badge variant="secondary">Exhausted</Badge> : null}
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="space-y-1 text-sm text-muted-foreground">
                                                <p>{formatDateTime(inviteCode.createdAt)}</p>
                                                <p>Expires: {formatDateTime(inviteCode.expiresAt)}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <div className="space-y-1 text-sm text-muted-foreground">
                                                <p>
                                                    {inviteCode.usageCount}
                                                    {inviteCode.maxUses == null ? " / unlimited" : ` / ${inviteCode.maxUses}`}
                                                </p>
                                                <p>
                                                    Remaining:{" "}
                                                    {inviteCode.remainingUses == null ? "Unlimited" : inviteCode.remainingUses}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                            {inviteCode.usage.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">No one has redeemed this code yet.</p>
                                            ) : (
                                                <ScrollArea className="h-28 pr-3">
                                                    <div className="space-y-3">
                                                        {inviteCode.usage.map((usage) => (
                                                            <div key={usage.id} className="space-y-1 text-sm">
                                                                <p className="font-medium text-foreground">{usage.usedBy.username}</p>
                                                                <p className="font-mono text-xs text-muted-foreground">{usage.usedBy.steamId}</p>
                                                                <p className="text-xs text-muted-foreground">Redeemed {formatDateTime(usage.usedAt)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            )}
                                        </TableCell>
                                        <TableCell className="align-top text-right">
                                            <DeleteInviteCodeButton
                                                inviteCodeId={inviteCode.id}
                                                code={inviteCode.code}
                                                onDeletedAction={onMutate}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}



