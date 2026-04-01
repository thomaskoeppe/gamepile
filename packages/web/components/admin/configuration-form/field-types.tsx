import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  warning,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  warning?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/40 p-4">
      <div className="space-y-0.5">
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />

      {warning && (
        <div className="flex items-center gap-1 text-sm text-yellow-500">
          <TriangleAlert className="h-4 w-4" />
          {warning}
        </div>
      )}
    </div>
  );
}

export function NumberField({
  label,
  description,
  value,
  onChange,
  min,
  warning,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  warning?: string;
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

      {warning && (
        <div className="flex items-center gap-1 text-sm text-yellow-500">
          <TriangleAlert className="h-4 w-4" />
          {warning}
        </div>
      )}
    </div>
  );
}

export function SelectField({
  label,
  description,
  value,
  onValueChange,
  children,
  warning,
}: {
  label: string;
  description: string;
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  warning?: string;
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

      {warning && (
        <div className="flex items-center gap-1 text-sm text-yellow-500">
          <TriangleAlert className="h-4 w-4" />
          {warning}
        </div>
      )}
    </div>
  );
}

