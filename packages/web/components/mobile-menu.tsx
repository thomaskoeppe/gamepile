"use client";

import { Award, Bell,ChevronRight, Clock, Gamepad2, Heart, Menu, Percent, ShoppingCart, User, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {Button} from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { browserLog } from "@/lib/browser-logger";

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
            <SheetContent side="left" className="w-[300px] sm:w-[350px] bg-card border-border p-0">
                <SheetHeader className="p-4 border-b border-border">
                    <SheetTitle className="text-foreground">Menu</SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto h-full py-4">
                    <div className="px-4 mb-4">
                        <div className="flex items-center gap-3 mb-4">
                            <Avatar className="h-10 w-10 border border-border">
                                <AvatarImage src="/placeholder.svg?height=40&width=40" alt="User" />
                                <AvatarFallback className="bg-primary">US</AvatarFallback>
                            </Avatar>
                            <div>
                                <div className="font-medium">Username</div>
                                <div className="text-sm text-muted-foreground">View Profile</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" className="flex-1 border-border hover:bg-muted">
                                <Bell className="h-5 w-5" />
                            </Button>
                            <Button variant="outline" size="icon" className="flex-1 border-border hover:bg-muted">
                                <Heart className="h-5 w-5" />
                            </Button>
                            <Button variant="outline" size="icon" className="flex-1 border-border hover:bg-muted">
                                <ShoppingCart className="h-5 w-5" />
                            </Button>
                            <Button variant="outline" size="icon" className="flex-1 border-border hover:bg-muted">
                                <User className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                    <div className="px-4 mb-2">
                        <Button asChild className="w-full bg-primary hover:bg-primary/90">
                            <Link href="/" onClick={() => setOpen(false)}>
                                Store Home
                            </Link>
                        </Button>
                    </div>

                    <Separator className="my-4 bg-border" />

                    <div className="px-4">
                        <h3 className="font-medium text-muted-foreground mb-3">DISCOVER</h3>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="#"
                                    className="flex items-center text-foreground hover:text-primary transition"
                                    onClick={() => setOpen(false)}
                                >
                                    <Zap className="mr-2 h-4 w-4" />
                                    <span>New & Noteworthy</span>
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="#"
                                    className="flex items-center text-muted-foreground hover:text-foreground transition"
                                    onClick={() => setOpen(false)}
                                >
                                    <Award className="mr-2 h-4 w-4" />
                                    <span>Top Sellers</span>
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="#"
                                    className="flex items-center text-muted-foreground hover:text-foreground transition"
                                    onClick={() => setOpen(false)}
                                >
                                    <Clock className="mr-2 h-4 w-4" />
                                    <span>Upcoming</span>
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="#"
                                    className="flex items-center text-muted-foreground hover:text-foreground transition"
                                    onClick={() => setOpen(false)}
                                >
                                    <Percent className="mr-2 h-4 w-4" />
                                    <span>Special Offers</span>
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="#"
                                    className="flex items-center text-muted-foreground hover:text-foreground transition"
                                    onClick={() => setOpen(false)}
                                >
                                    <Gamepad2 className="mr-2 h-4 w-4" />
                                    <span>VR Games</span>
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <Separator className="my-4 bg-border" />

                    <div className="px-4">
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="categories" className="border-none">
                                <AccordionTrigger className="py-2 text-muted-foreground hover:text-foreground hover:no-underline">
                                    CATEGORIES
                                </AccordionTrigger>
                                <AccordionContent>
                                    <ul className="space-y-2 pl-2">
                                        <li>
                                            <Link href="#" className="flex items-center justify-between text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                                <span>Action</span>
                                                <ChevronRight className="h-4 w-4" />
                                            </Link>
                                        </li>
                                        <li>
                                            <Link href="#" className="flex items-center justify-between text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                                <span>Adventure</span>
                                                <ChevronRight className="h-4 w-4" />
                                            </Link>
                                        </li>
                                        <li>
                                            <Link href="#" className="flex items-center justify-between text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                                <span>RPG</span>
                                                <ChevronRight className="h-4 w-4" />
                                            </Link>
                                        </li>
                                        <li>
                                            <Link href="#" className="flex items-center justify-between text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                                <span>Strategy</span>
                                                <ChevronRight className="h-4 w-4" />
                                            </Link>
                                        </li>
                                        <li>
                                            <Link href="#" className="flex items-center justify-between text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                                <span>Simulation</span>
                                                <ChevronRight className="h-4 w-4" />
                                            </Link>
                                        </li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="hardware" className="border-none">
                                <AccordionTrigger className="py-2 text-muted-foreground hover:text-foreground hover:no-underline">
                                    HARDWARE
                                </AccordionTrigger>
                                <AccordionContent>
                                    <ul className="space-y-2 pl-2">
                                        <li>
                                            <Link href="#" className="flex items-center text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                                <span>Steam Deck</span>
                                            </Link>
                                        </li>
                                        <li>
                                            <Link href="#" className="flex items-center text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                                <span>Steam Controller</span>
                                            </Link>
                                        </li>
                                        <li>
                                            <Link href="#" className="flex items-center text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                                <span>Valve Index VR</span>
                                            </Link>
                                        </li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>

                    <Separator className="my-4 bg-border" />

                    <div className="px-4">
                        <ul className="space-y-2">
                            <li>
                                <Link href="#" className="flex items-center text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                    News
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="flex items-center text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                    Community
                                </Link>
                            </li>
                            <li>
                                <Link href="#" className="flex items-center text-muted-foreground hover:text-foreground transition" onClick={() => setOpen(false)}>
                                    Support
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
