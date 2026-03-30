"use client";

import {Cog, FolderKanban, KeyRound, LogIn, LogOut, Settings, Shapes,Shield} from "lucide-react";
import {Heart} from "lucide-react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {ReactNode, useState} from "react";

import {MobileMenu} from "@/components/mobile-menu";
import {SearchDialog, SearchTrigger} from "@/components/search-dialog";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {Button} from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { browserLog } from "@/lib/browser-logger";
import { useRequireAuth, useSession } from "@/lib/providers/session";
import {cn} from "@/lib/utils";

export function NavLink({ href, children, isActive }: { href: string; children: ReactNode, isActive?: boolean }) {
    const style = "text-foreground hover:text-primary font-medium transition-colors duration-300 relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:bg-primary after:transition-all after:duration-300";

    return (
        <Link href={href} className={cn(style, isActive && "font-bold text-primary")}>
            {children}
        </Link>
    );
}

export function Header() {
    const pathname = usePathname();
    const { authenticated, user, isLoading, login, logout } = useSession();

    const isPublicRoute = pathname.startsWith("/collections/p/");
    useRequireAuth("/", { skip: isPublicRoute });

    const [searchOpen, setSearchOpen] = useState(false);

    const handleSearchOpen = () => {
        browserLog.info('Search dialog opened', { component: 'Header', from: pathname });
        setSearchOpen(true);
    };

    const handleSearchChange = (open: boolean) => {
        if (!open) {
            browserLog.info('Search dialog closed', { component: 'Header' });
        }
        setSearchOpen(open);
    };

    const handleLogin = () => {
        browserLog.info('Sign in clicked', { component: 'Header' });
        login();
    };

    const handleLogout = () => {
        browserLog.info('Sign out clicked', { component: 'Header', userId: user?.id });
        void logout();
    };

    return (
        <>
            <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
                <div className="container-fluid mx-auto px-4">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-8">
                            <Link href="/" className="flex items-center gap-2 group">
                                <div className="relative w-8 h-8 overflow-hidden rounded-full bg-linear-to-br from-primary to-emerald-400 group-hover:from-emerald-400 group-hover:to-teal-400 transition-all duration-300">
                                    <Shapes className="w-8 h-8 scale-75 group-hover:scale-100 transition-transform duration-300" />
                                </div>

                                <span className="font-bold text-xl tracking-tight group-hover:text-primary transition-colors duration-300">GAMEPILE</span>
                            </Link>
                            <nav className="hidden md:flex items-center space-x-6">
                                <NavLink href="/library" isActive={pathname === "/library"}>Library</NavLink>
                                <NavLink href="/explore" isActive={pathname === "/explore"}>Explore</NavLink>
                                <NavLink href="/collections" isActive={pathname.startsWith("/collections")}>Collections</NavLink>
                                <NavLink href="/vaults" isActive={pathname === "/vaults"}>Key Vaults</NavLink>
                            </nav>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="ml-auto flex-1 md:max-w-sm lg:max-w-md">
                                <SearchTrigger
                                    onClick={handleSearchOpen}
                                    className="w-full justify-start"
                                />
                            </div>

                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground group hover:bg-muted/50 transition-all duration-300">
                                <Heart className="h-5 w-5 group-hover:scale-110 group-hover:text-rose-500 transition-all duration-300" />
                            </Button>

                            {!isLoading && authenticated ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Avatar className="h-8 w-8 border border-border ring-2 ring-primary/20 hover:ring-primary/50 transition-all duration-300 cursor-pointer">
                                            <AvatarImage src={user?.avatarUrl} alt="User" />
                                            <AvatarFallback className="bg-linear-to-br from-primary to-emerald-400">?</AvatarFallback>
                                        </Avatar>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem asChild className="cursor-pointer">
                                            <Link href="/settings" className="flex items-center gap-2">
                                                <Settings className="h-4 w-4" /> Account Settings
                                            </Link>
                                        </DropdownMenuItem>
                                        {user?.role === "ADMIN" && (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuLabel className="text-xs">Admin</DropdownMenuLabel>
                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                    <Link href="/admin/jobs" className="flex items-center gap-2">
                                                        <Shield className="h-4 w-4" /> Jobs
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                    <Link href="/admin/configuration" className="flex items-center gap-2">
                                                        <Cog className="h-4 w-4" /> Configuration
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                    <Link href="/admin/vaults" className="flex items-center gap-2">
                                                        <KeyRound className="h-4 w-4" /> Vaults
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                    <Link href="/admin/collections" className="flex items-center gap-2">
                                                        <FolderKanban className="h-4 w-4" /> Collections
                                                    </Link>
                                                </DropdownMenuItem>
                                            </>
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer"><LogOut /> Sign out</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <Button variant="secondary" size="sm" onClick={handleLogin}>
                                    <LogIn className="inline-block mr-2 h-5 w-5" /> Sign In
                                </Button>
                            )}

                            <MobileMenu />
                        </div>
                    </div>
                </div>
            </header>

            <SearchDialog open={searchOpen} onOpenChange={handleSearchChange} />
        </>
    );
}