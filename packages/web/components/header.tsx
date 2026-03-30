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

const GithubIcon = ({ className }: { className: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#fff" className={className} viewBox="0 0 16 16">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/>
    </svg>
);

export function NavLink({href, children, isActive}: { href: string; children: ReactNode, isActive?: boolean }) {
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

    const version = process.env.WEB_APP_VERSION;

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

                            <Link
                                href="https://github.com/thomaskoeppe/gamepile"
                                target="_blank"
                            >
                                <Button
                                    variant="ghost"
                                    className="px-2 text-muted-foreground hover:text-foreground group-hover:bg-muted/50 transition-all duration-300"
                                >
                                    <GithubIcon className="h-5 w-5" />
                                    <span>v{version}</span>
                                </Button>
                            </Link>

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