import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Rendered for unmatched routes and for `notFound()` calls in server components.
 */
export default function NotFound() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
            <p className="font-mono text-5xl font-bold text-muted-foreground">404</p>

            <div className="space-y-2">
                <h1 className="font-heading text-2xl font-semibold">Page not found</h1>
                <p className="max-w-md text-sm text-muted-foreground">
                    That page does not exist, or you do not have access to it.
                </p>
            </div>

            <Button asChild>
                <Link href="/library">Back to library</Link>
            </Button>
        </div>
    );
}
