"use client";

import { cva } from "class-variance-authority";
import {Check, ChevronsUpDown} from "lucide-react";
import * as React from "react";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from "@/components/ui/command";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,} from "@/components/ui/tooltip";
import {cn} from "@/lib/utils";

const selectedTagVariants = cva(
    "h-5 shrink-0 max-w-25 px-1.5 text-[11px] font-medium",
    {
        variants: {
            tone: {
                primary: "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20",
                muted: "border-border/50 text-muted-foreground cursor-default",
            },
        },
        defaultVariants: {
            tone: "primary",
        },
    }
);

export interface ComboboxOption {
    value: string
    label: string
    category?: string
}

interface MultiSelectComboboxProps {
    options: ComboboxOption[]
    selected: string[]
    onChange: (selected: string[]) => void
    placeholder?: string
    className?: string
    searchPlaceholder?: string
    emptyText?: string
    maxDisplayedTags?: number
}

export function MultiSelectCombobox({
    options,
    selected,
    onChange,
    placeholder = "Select options...",
    className,
    searchPlaceholder = "Search...",
    emptyText = "No results found.",
    maxDisplayedTags = 2,
}: MultiSelectComboboxProps) {
    const [open, setOpen] = React.useState(false);

    const groupedOptions = React.useMemo(() => {
        const groups: Record<string, ComboboxOption[]> = {};
        const uncategorized: ComboboxOption[] = [];

        options.forEach((option) => {
            if (option.category) {
                if (!groups[option.category]) {
                    groups[option.category] = [];
                }
                groups[option.category].push(option);
            } else {
                uncategorized.push(option);
            }
        });

        return {groups, uncategorized};
    }, [options]);

    const handleSelect = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter((item) => item !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const selectedLabels = React.useMemo(() => {
        return selected
            .map((value) => ({
                value, label: options.find((opt) => opt.value === value)?.label || value,
            }))
            .filter((item) => item.label);
    }, [selected, options]);

    const displayedTags = selectedLabels.slice(0, maxDisplayedTags);
    const hiddenTags = selectedLabels.slice(maxDisplayedTags);
    const hasHiddenTags = hiddenTags.length > 0;

    return (<Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn("h-9 justify-between border-border/50 bg-card/50 hover:bg-card/80 hover:border-border focus-visible:border-primary focus-visible:ring-primary/20 transition-all duration-200", className,)}
            >
                <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                    {selected.length === 0 ? (
                        <span className="text-muted-foreground truncate">{placeholder}</span>) : (<>
                        {displayedTags.map((item) => (<Badge
                            key={item.value}
                            variant="secondary"
                            className={selectedTagVariants()}
                        >
                            <span className="truncate">{item.label}</span>
                        </Badge>))}

                        {hasHiddenTags && (<TooltipProvider delayDuration={200}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge
                                        variant="outline"
                                        className={selectedTagVariants({ tone: "muted" })}
                                    >
                                        +{hiddenTags.length}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="bottom"
                                    className="max-w-50 p-2"
                                >
                                    <div className="flex flex-wrap gap-1">
                                        {hiddenTags.map((item) => (<Badge
                                            key={item.value}
                                            variant="secondary"
                                            className="text-[10px] px-1.5 py-0"
                                        >
                                            {item.label}
                                        </Badge>))}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>)}
                    </>)}
                </div>
                <ChevronsUpDown className="ml-1.5 size-3.5 shrink-0 opacity-50"/>
            </Button>
        </PopoverTrigger>

        <PopoverContent className="w-70 p-0" align="start">
            <Command>
                <CommandInput
                    placeholder={searchPlaceholder}
                    className="border-0 focus:ring-0"
                />
                <CommandList className="max-h-70">
                    <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                        {emptyText}
                    </CommandEmpty>

                    {groupedOptions.uncategorized.length > 0 && (
                        <CommandGroup>
                            {groupedOptions.uncategorized.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={`${option.label} ${option.value}`}
                                    onSelect={() => handleSelect(option.value)}
                                    className="cursor-pointer"
                                >
                                    <Check
                                        className={cn("mr-2 size-4 text-primary", selected.includes(option.value) ? "opacity-100" : "opacity-0",)}
                                    />
                                    <span className={cn(selected.includes(option.value) && "text-primary font-medium")}>
                                      {option.label}
                                    </span>
                            </CommandItem>
                            ))}
                        </CommandGroup>
                    )}

                    {Object.entries(groupedOptions.groups).map(([category, categoryOptions], index) => (
                        <React.Fragment key={category}>
                            {(index > 0 || groupedOptions.uncategorized.length > 0) && (<CommandSeparator/>)}
                            <CommandGroup heading={category.toUpperCase()} className="font-medium">
                                {categoryOptions.map((option) => (<CommandItem
                                    key={option.value}
                                    value={`${option.label} ${category}`}
                                    onSelect={() => handleSelect(option.value)}
                                    className="cursor-pointer"
                                >
                                    <Check
                                        className={cn("mr-2 size-4 text-primary", selected.includes(option.value) ? "opacity-100" : "opacity-0",)}
                                    />
                                    <span
                                        className={cn(selected.includes(option.value) && "text-primary font-medium")}>
                                    {option.label}
                                  </span>
                                </CommandItem>))}
                            </CommandGroup>
                        </React.Fragment>
                    ))}
                </CommandList>
            </Command>
        </PopoverContent>
    </Popover>);
}
