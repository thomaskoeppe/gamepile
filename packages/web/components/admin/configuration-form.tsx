"use client";

import { LoaderCircle, RefreshCw, Settings } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { browserLog } from "@/lib/browser-logger";
import { AppSettingKey, KeyVaultAuthType } from "@/prisma/generated/enums";
import { reloadSettings, saveConfiguration } from "@/server/actions/admin";
import type { AppSettingValueType } from "@/types/app-setting";

interface ConfigurationFormProps {
    settings: AppSettingValueType;
    onSaved?: () => void;
}

function SwitchField({
    label,
    description,
    checked,
    onCheckedChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="space-y-0.5">
                <p className="font-medium text-foreground">{label}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}

function NumberField({
    label,
    description,
    value,
    onChange,
    min,
}: {
    label: string;
    description: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
}) {
    return (
        <div className="grid gap-3 rounded-lg border border-border/60 bg-background/40 p-4 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-center">
            <div className="space-y-0.5">
                <p className="font-medium text-foreground">{label}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Input
                type="number"
                value={value}
                min={min}
                onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
                className="bg-background"
            />
        </div>
    );
}

function SelectField({
    label,
    description,
    value,
    onValueChange,
    children,
}: {
    label: string;
    description: string;
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
}) {
    return (
        <div className="grid gap-3 rounded-lg border border-border/60 bg-background/40 p-4 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-center">
            <div className="space-y-0.5">
                <p className="font-medium text-foreground">{label}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger className="w-full bg-background">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>{children}</SelectContent>
            </Select>
        </div>
    );
}

function SectionHeading({ children }: { children: ReactNode }) {
    return (
        <h3 className="pt-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {children}
        </h3>
    );
}

export function ConfigurationForm({ settings, onSaved }: ConfigurationFormProps) {
    const [formData, setFormData] = useState<AppSettingValueType>(settings);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const saveAction = useAction(saveConfiguration, {
        onSuccess: () => {
            browserLog.info('Configuration saved', { component: 'ConfigurationForm' });
            setSaveSuccess(true);
            onSaved?.();
            setTimeout(() => setSaveSuccess(false), 3000);
        },
    });

    const reloadAction = useAction(reloadSettings);

    const update = <K extends AppSettingKey>(key: K, value: AppSettingValueType[K]) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    const bool = (key: AppSettingKey) => formData[key] as boolean;
    const num = (key: AppSettingKey) => formData[key] as number;

    return (
        <div className="space-y-6">
            <Card className="border-border/70 bg-card/95">
                <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Settings className="size-5 text-primary" />
                            Platform Configuration
                        </CardTitle>
                        <CardDescription>
                            Configure platform-wide defaults for user management, vaults, and collections.
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4">
                    {saveSuccess && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
                            Configuration saved successfully.
                        </div>
                    )}
                    {saveAction.result?.serverError && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            {saveAction.result.serverError}
                        </div>
                    )}

                    <SectionHeading>User Management</SectionHeading>

                    <SwitchField
                        label="Allow new signups"
                        description="Control whether Steam users can create new accounts."
                        checked={bool(AppSettingKey.ALLOW_USER_SIGNUP)}
                        onCheckedChange={(v) => update(AppSettingKey.ALLOW_USER_SIGNUP, v)}
                    />
                    <SwitchField
                        label="Allow account deletion"
                        description="Whether users can permanently delete their own accounts."
                        checked={bool(AppSettingKey.ALLOW_USER_ACCOUNT_DELETION)}
                        onCheckedChange={(v) => update(AppSettingKey.ALLOW_USER_ACCOUNT_DELETION, v)}
                    />
                    <SwitchField
                        label="Allow invite code generation"
                        description="Whether admin users can generate new invite codes."
                        checked={bool(AppSettingKey.ALLOW_INVITE_CODE_GENERATION)}
                        onCheckedChange={(v) => update(AppSettingKey.ALLOW_INVITE_CODE_GENERATION, v)}
                    />
                    <NumberField
                        label="Session timeout (seconds)"
                        description="Duration in seconds before an idle session is invalidated."
                        value={num(AppSettingKey.SESSION_TIMEOUT_SECONDS)}
                        onChange={(v) => update(AppSettingKey.SESSION_TIMEOUT_SECONDS, v)}
                        min={60}
                    />

                    <SectionHeading>Vault Security</SectionHeading>

                    <SwitchField
                        label="Allow password change"
                        description="Whether vault owners can change their vault password."
                        checked={bool(AppSettingKey.VAULT_ALLOW_PASSWORD_CHANGE)}
                        onCheckedChange={(v) => update(AppSettingKey.VAULT_ALLOW_PASSWORD_CHANGE, v)}
                    />
                    <SwitchField
                        label="Block on incorrect password"
                        description="Lock a user's vault access after too many failed authentication attempts."
                        checked={bool(AppSettingKey.VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD)}
                        onCheckedChange={(v) => update(AppSettingKey.VAULT_BLOCK_USER_ON_INCORRECT_PASSWORD, v)}
                    />
                    <NumberField
                        label="Block duration (seconds)"
                        description="How long a vault is locked after too many failed attempts."
                        value={num(AppSettingKey.VAULT_BLOCK_DURATION_SECONDS)}
                        onChange={(v) => update(AppSettingKey.VAULT_BLOCK_DURATION_SECONDS, v)}
                        min={0}
                    />
                    <NumberField
                        label="Failed attempts before block"
                        description="Number of consecutive wrong passwords before triggering a lockout."
                        value={num(AppSettingKey.VAULT_BLOCK_AFTER_ATTEMPTS)}
                        onChange={(v) => update(AppSettingKey.VAULT_BLOCK_AFTER_ATTEMPTS, v)}
                        min={1}
                    />

                    <SectionHeading>Vault Authentication</SectionHeading>

                    <SelectField
                        label="Default vault auth type"
                        description="Protection level applied to newly created vaults."
                        value={formData[AppSettingKey.VAULT_DEFAULT_AUTH_TYPE]}
                        onValueChange={(v) => update(AppSettingKey.VAULT_DEFAULT_AUTH_TYPE, v as KeyVaultAuthType)}
                    >
                        <SelectItem value={KeyVaultAuthType.NONE}>None</SelectItem>
                        <SelectItem value={KeyVaultAuthType.PIN}>PIN</SelectItem>
                        <SelectItem value={KeyVaultAuthType.PASSWORD}>Password</SelectItem>
                    </SelectField>

                    <SwitchField
                        label="Allow password auth"
                        description="Users may protect vaults with a password."
                        checked={bool(AppSettingKey.VAULT_AUTH_ALLOW_PASSWORD)}
                        onCheckedChange={(v) => update(AppSettingKey.VAULT_AUTH_ALLOW_PASSWORD, v)}
                    />
                    <SwitchField
                        label="Allow PIN auth"
                        description="Users may protect vaults with a numeric PIN."
                        checked={bool(AppSettingKey.VAULT_AUTH_ALLOW_PIN)}
                        onCheckedChange={(v) => update(AppSettingKey.VAULT_AUTH_ALLOW_PIN, v)}
                    />

                    <SectionHeading>Vault Password Policy</SectionHeading>

                    <NumberField
                        label="Password minimum length"
                        description="Shortest allowed vault password in characters."
                        value={num(AppSettingKey.VAULT_PASSWORD_MIN_LENGTH)}
                        onChange={(v) => update(AppSettingKey.VAULT_PASSWORD_MIN_LENGTH, v)}
                        min={1}
                    />
                    <NumberField
                        label="Password maximum length"
                        description="Longest allowed vault password in characters."
                        value={num(AppSettingKey.VAULT_PASSWORD_MAX_LENGTH)}
                        onChange={(v) => update(AppSettingKey.VAULT_PASSWORD_MAX_LENGTH, v)}
                        min={1}
                    />
                    <NumberField
                        label="PIN minimum length"
                        description="Shortest allowed vault PIN in digits."
                        value={num(AppSettingKey.VAULT_PIN_MIN_LENGTH)}
                        onChange={(v) => update(AppSettingKey.VAULT_PIN_MIN_LENGTH, v)}
                        min={1}
                    />
                    <NumberField
                        label="PIN maximum length"
                        description="Longest allowed vault PIN in digits."
                        value={num(AppSettingKey.VAULT_PIN_MAX_LENGTH)}
                        onChange={(v) => update(AppSettingKey.VAULT_PIN_MAX_LENGTH, v)}
                        min={1}
                    />

                    <SectionHeading>Vault Management</SectionHeading>

                    <SwitchField
                        label="Allow vault deletion"
                        description="Whether users can permanently delete their own vaults."
                        checked={bool(AppSettingKey.ALLOW_VAULT_DELETION)}
                        onCheckedChange={(v) => update(AppSettingKey.ALLOW_VAULT_DELETION, v)}
                    />
                    <SwitchField
                        label="Disable vault sharing"
                        description="Prevent users from inviting others into their vaults."
                        checked={bool(AppSettingKey.DISABLE_VAULT_SHARING)}
                        onCheckedChange={(v) => update(AppSettingKey.DISABLE_VAULT_SHARING, v)}
                    />
                    <NumberField
                        label="Max vaults per user"
                        description="Maximum number of vaults a single user can create."
                        value={num(AppSettingKey.MAX_VAULTS_PER_USER)}
                        onChange={(v) => update(AppSettingKey.MAX_VAULTS_PER_USER, v)}
                        min={1}
                    />

                    <SectionHeading>Collections</SectionHeading>

                    <SwitchField
                        label="Allow public collections"
                        description="Whether users can create publicly visible collections."
                        checked={bool(AppSettingKey.ALLOW_PUBLIC_COLLECTIONS)}
                        onCheckedChange={(v) => update(AppSettingKey.ALLOW_PUBLIC_COLLECTIONS, v)}
                    />
                    <NumberField
                        label="Max collections per user"
                        description="Maximum number of collections a single user can create."
                        value={num(AppSettingKey.MAX_COLLECTIONS_PER_USER)}
                        onChange={(v) => update(AppSettingKey.MAX_COLLECTIONS_PER_USER, v)}
                        min={1}
                    />

                    <SectionHeading>Admin Features</SectionHeading>

                    <SwitchField
                        label="Admin can delete any vault"
                        description="Allow admins to permanently delete any user's vault."
                        checked={bool(AppSettingKey.ADMIN_CAN_DELETE_ANY_VAULT)}
                        onCheckedChange={(v) => update(AppSettingKey.ADMIN_CAN_DELETE_ANY_VAULT, v)}
                    />
                    <SwitchField
                        label="Admin can delete any collection"
                        description="Allow admins to permanently delete any user's collection."
                        checked={bool(AppSettingKey.ADMIN_CAN_DELETE_ANY_COLLECTION)}
                        onCheckedChange={(v) => update(AppSettingKey.ADMIN_CAN_DELETE_ANY_COLLECTION, v)}
                    />
                    <SwitchField
                        label="Admin can change resource owner"
                        description="Allow admins to transfer vault or collection ownership to another user."
                        checked={bool(AppSettingKey.ADMIN_CAN_CHANGE_RESOURCE_OWNER)}
                        onCheckedChange={(v) => update(AppSettingKey.ADMIN_CAN_CHANGE_RESOURCE_OWNER, v)}
                    />

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                browserLog.info('Reload settings clicked', { component: 'ConfigurationForm' });
                                reloadAction.execute();
                            }}
                            disabled={reloadAction.isPending}
                        >
                            {reloadAction.isPending
                                ? <LoaderCircle className="size-4 animate-spin" />
                                : <RefreshCw className="size-4" />}
                            Reload Settings
                        </Button>
                        <Button onClick={() => {
                            browserLog.info('Save configuration clicked', { component: 'ConfigurationForm' });
                            saveAction.execute(formData);
                        }} disabled={saveAction.isPending}>
                            {saveAction.isPending
                                ? <LoaderCircle className="size-4 animate-spin" />
                                : <Settings className="size-4" />}
                            Save Configuration
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
