"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {Button} from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { browserLog } from "@/lib/browser-logger";

const NAV_ITEMS = [
    { href: "/library", label: "Library" },
    { href: "/explore", label: "Explore" },
    { href: "/collections", label: "Collections" },
    { href: "/vaults", label: "Key Vaults" },
    { href: "/settings", label: "Settings" },
];

export function MobileMenu() {
    const [open, setOpen] = useState(false);

    const handleOpenChange = (next: boolean) => {
        browserLog.info(next ? 'Mobile menu opened' : 'Mobile menu closed', { component: 'MobileMenu' });
        setOpen(next);
    };

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden text-muted-foreground hover:text-foreground">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Open menu</span>
                </Button>
            </SheetTrigger>

            <SheetContent side="left" className="w-75 sm:w-87.5 bg-card border-border p-0">
                <SheetHeader className="p-4 border-b border-border">
                    <SheetTitle className="text-foreground">Menu</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto h-full py-4 px-4 space-y-4">
                    <Button asChild className="w-full bg-primary hover:bg-primary/90">
                        <Link href="/" onClick={() => setOpen(false)}>
                            Home
                        </Link>
                    </Button>

                    <Separator className="bg-border" />

                    <nav>
                        <ul className="space-y-2">
                            {NAV_ITEMS.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className="flex items-center rounded-md px-2 py-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                                        onClick={() => setOpen(false)}
                                    >
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
            </SheetContent>
        </Sheet>
    );
}
