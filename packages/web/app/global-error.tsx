"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary. Next.js renders this when the **root layout**
 * itself throws, which is the one case `app/error.tsx` cannot cover — and the
 * case that previously produced a bare `text/plain` "Internal Server Error"
 * response with no markup at all.
 *
 * It replaces the root layout entirely, so it must supply its own `<html>` and
 * `<body>`, and it deliberately avoids importing app providers, fonts, or
 * settings: anything it depends on is something that could already be broken.
 * Styling is inline for the same reason.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        // Best-effort: the logger pipeline may be part of what failed.
        try {
            void fetch("/api/logs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // POST /api/logs takes a bare array of entries.
                body: JSON.stringify([
                    {
                        timestamp: new Date().toISOString(),
                        level: "error",
                        message: "Root layout render failed",
                        context: { digest: error.digest, namespace: "app.globalError" },
                        error: { name: error.name, message: error.message, stack: error.stack },
                    },
                ]),
                keepalive: true,
            }).catch(() => undefined);
        } catch {
            // Never let error reporting throw inside the error boundary.
        }
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#0a0a0b",
                    color: "#e8e8ea",
                    fontFamily:
                        "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                    padding: "1.5rem",
                }}
            >
                <main style={{ maxWidth: "32rem", textAlign: "center" }}>
                    <p
                        style={{
                            margin: "0 0 0.75rem",
                            fontSize: "0.75rem",
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            color: "#8b8b93",
                        }}
                    >
                        Gamepile
                    </p>

                    <h1 style={{ margin: "0 0 0.75rem", fontSize: "1.5rem", fontWeight: 600 }}>
                        The application failed to start rendering
                    </h1>

                    <p style={{ margin: "0 0 1.5rem", fontSize: "0.875rem", lineHeight: 1.6, color: "#a1a1aa" }}>
                        This is usually a temporary problem reaching the database or cache. The server keeps retrying in
                        the background, so reloading in a moment will often work. Check{" "}
                        <code style={{ color: "#e8e8ea" }}>/api/health/ready</code> for which dependency is unhealthy.
                    </p>

                    {error.digest ? (
                        <p
                            style={{
                                margin: "0 0 1.5rem",
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                fontSize: "0.75rem",
                                color: "#8b8b93",
                            }}
                        >
                            Reference: {error.digest}
                        </p>
                    ) : null}

                    <button
                        type="button"
                        onClick={reset}
                        style={{
                            cursor: "pointer",
                            borderRadius: "0.5rem",
                            border: "1px solid #2a2a30",
                            backgroundColor: "#e8e8ea",
                            color: "#0a0a0b",
                            padding: "0.5rem 1.25rem",
                            fontSize: "0.875rem",
                            fontWeight: 600,
                        }}
                    >
                        Try again
                    </button>
                </main>
            </body>
        </html>
    );
}
