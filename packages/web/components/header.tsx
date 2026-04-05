"use client";

import {Cog, FolderKanban, Heart, KeyRound, LogIn, LogOut, Settings, Shield} from "lucide-react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {ReactNode, useState} from "react";

import {SearchDialog, SearchTrigger} from "@/components/dialogs/search";
import {MobileMenu} from "@/components/mobile-menu";
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
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className={className} viewBox="0 0 16 16">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/>
    </svg>
);

const Logo = ({ className, iconColor }: { className: string, iconColor: string }) => (
    <svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="M19.5617 7C19.7904 5.69523 18.7863 4.5 17.4617 4.5H6.53788C5.21323 4.5 4.20922 5.69523 4.43784 7" stroke={iconColor} strokeWidth="1.5"/>
        <path d="M17.4999 4.5C17.5283 4.24092 17.5425 4.11135 17.5427 4.00435C17.545 2.98072 16.7739 2.12064 15.7561 2.01142C15.6497 2 15.5194 2 15.2588 2H8.74099C8.48035 2 8.35002 2 8.24362 2.01142C7.22584 2.12064 6.45481 2.98072 6.45704 4.00434C6.45727 4.11135 6.47146 4.2409 6.49983 4.5" stroke={iconColor} strokeWidth="1.5"/>
        <path d="M15 18H9" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M21.1935 16.793C20.8437 19.2739 20.6689 20.5143 19.7717 21.2572C18.8745 22 17.5512 22 14.9046 22H9.09536C6.44881 22 5.12553 22 4.22834 21.2572C3.33115 20.5143 3.15626 19.2739 2.80648 16.793L2.38351 13.793C1.93748 10.6294 1.71447 9.04765 2.66232 8.02383C3.61017 7 5.29758 7 8.67239 7H15.3276C18.7024 7 20.3898 7 21.3377 8.02383C22.0865 8.83268 22.1045 9.98979 21.8592 12" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round"/>
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
                                <Logo className="size-8 transition-transform duration-300 group-hover:rotate-6 stroke-current group-hover:stroke-primary" iconColor={""} />

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

                            <Button variant="ghost" size="icon" aria-label="Open favorites" className="text-muted-foreground hover:text-foreground group hover:bg-muted/50 transition-all duration-300">
                                <Heart className="size-5 group-hover:scale-110 transition-all duration-300" />
                            </Button>

                            <Button
                                variant="ghost"
                                asChild
                                className="px-2 text-muted-foreground hover:text-foreground group-hover:bg-muted/50 transition-all duration-300"
                            >
                                <Link
                                    href="https://github.com/thomaskoeppe/gamepile"
                                    target="_blank"
                                >
                                    <GithubIcon className="size-5" />
                                    <span>v{version}</span>
                                </Link>
                            </Button>

                            {!isLoading && authenticated ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Avatar className="size-8 cursor-pointer border border-border ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/50">
                                            <AvatarImage src={user?.avatarUrl} alt="User" />
                                            <AvatarFallback className="bg-linear-to-br from-primary to-primary/75">?</AvatarFallback>
                                        </Avatar>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem asChild className="cursor-pointer">
                                            <Link href="/settings" className="flex items-center gap-2">
                                                <Settings className="size-4" /> Account Settings
                                            </Link>
                                        </DropdownMenuItem>
                                        {user?.role === "ADMIN" && (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuLabel className="text-xs">Admin</DropdownMenuLabel>
                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                    <Link href="/admin/jobs" className="flex items-center gap-2">
                                                        <Shield className="size-4" /> Jobs
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                    <Link href="/admin/configuration" className="flex items-center gap-2">
                                                        <Cog className="size-4" /> Configuration
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                    <Link href="/admin/vaults" className="flex items-center gap-2">
                                                        <KeyRound className="size-4" /> Vaults
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="cursor-pointer">
                                                    <Link href="/admin/collections" className="flex items-center gap-2">
                                                        <FolderKanban className="size-4" /> Collections
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
                                    <LogIn className="mr-2 inline-block size-5" /> Sign In
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