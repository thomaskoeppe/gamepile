"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ADMIN_SECTIONS = [
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/invite-codes", label: "Invite Codes" },
  { href: "/admin/configuration", label: "Configuration" },
  { href: "/admin/vaults", label: "Vaults" },
  { href: "/admin/collections", label: "Collections" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 rounded-xl border border-border/70 bg-card/95 p-2">
      {ADMIN_SECTIONS.map((section) => {
        const isActive = pathname === section.href || pathname.startsWith(`${section.href}/`);

        return (
          <Link
            key={section.href}
            href={section.href}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              isActive && "bg-primary/10 text-primary",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

