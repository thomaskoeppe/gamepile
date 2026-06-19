import { Check, ClipboardCopy, Link2, LoaderCircle } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { ReactNode, useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { browserLog } from "@/lib/browser-logger";
import { getSlugError, normalizeSlug } from "@/lib/slug";
import { setCollectionSlug } from "@/server/actions/collections";
import { setVaultSlug } from "@/server/actions/vaults/manage";

type CustomUrlResource = "vault" | "collection";

const BASE_PATH: Record<CustomUrlResource, string> = {
    vault: "/vaults/",
    collection: "/collections/",
};

/**
 * Lets the owner set or clear a custom URL slug for a vault (#10) or collection
 * (#11). Mirrors the rename dialogs; validates with the shared `lib/slug` rules
 * and surfaces server-side uniqueness errors.
 */
export function CustomUrlDialog({
    resourceType,
    resourceId,
    currentSlug,
    children,
    onReload,
}: {
    resourceType: CustomUrlResource;
    resourceId: string;
    currentSlug: string | null;
    children: ReactNode;
    onReload?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(currentSlug ?? "");
    const [serverError, setServerError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const vaultAction = useAction(setVaultSlug);
    const collectionAction = useAction(setCollectionSlug);
    const isPending = vaultAction.isPending || collectionAction.isPending;

    const normalized = normalizeSlug(value);
    const clientError = normalized.length > 0 ? getSlugError(normalized) : null;

    // When the field is empty the user is removing the custom URL, so fall back to
    // the canonical id path rather than the now-stale current slug.
    const previewPath = `${BASE_PATH[resourceType]}${normalized || resourceId}`;
    const fullUrl = useMemo(
        () => (typeof window !== "undefined" ? `${window.location.origin}${previewPath}` : previewPath),
        [previewPath],
    );

    const resetDialog = useCallback(() => {
        setServerError(null);
        setCopied(false);
        setValue(currentSlug ?? "");
    }, [currentSlug]);

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next);
        if (!next) resetDialog();
    }, [resetDialog]);

    const handleSubmit = useCallback(async () => {
        setServerError(null);
        if (clientError) {
            setServerError(clientError);
            return;
        }

        browserLog.info("Set custom url submitted", { resourceType, resourceId, slug: normalized });
        const result = resourceType === "vault"
            ? await vaultAction.executeAsync({ vaultId: resourceId, slug: normalized })
            : await collectionAction.executeAsync({ collectionId: resourceId, slug: normalized });

        if (result?.data?.success) {
            browserLog.info("Custom url updated", { resourceType, resourceId, slug: result.data.slug });
            onReload?.();
            setOpen(false);
            setTimeout(resetDialog, 300);
        } else {
            setServerError(result?.serverError ?? "An unexpected error occurred.");
        }
    }, [clientError, collectionAction, normalized, onReload, resetDialog, resourceId, resourceType, vaultAction]);

    const handleCopy = useCallback(async () => {
        await navigator.clipboard.writeText(fullUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [fullUrl]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>{children}</DialogTrigger>

            <DialogContent className="outline-none">
                <DialogHeader>
                    <DialogTitle>Custom URL</DialogTitle>
                    <DialogDescription>
                        Choose a memorable URL to share this {resourceType}. Leave empty to remove it.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <FieldGroup>
                        <Field data-invalid={!!clientError}>
                            <FieldLabel htmlFor="custom-url-slug">URL name</FieldLabel>
                            <Input
                                id="custom-url-slug"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder="my-awesome-vault"
                                autoComplete="off"
                                autoFocus
                            />
                            <FieldDescription className="break-all">{previewPath}</FieldDescription>
                            {clientError && <FieldError errors={[{ message: clientError }]} />}
                        </Field>
                    </FieldGroup>

                    {serverError && <p className="text-sm text-destructive">{serverError}</p>}

                    <Button type="button" variant="outline" className="w-full" onClick={handleCopy}>
                        {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                        {copied ? "Copied" : "Copy link"}
                    </Button>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleSubmit} disabled={isPending || !!clientError}>
                            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                            Save
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
