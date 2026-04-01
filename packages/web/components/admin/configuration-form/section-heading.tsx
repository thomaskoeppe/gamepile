import type { ReactNode } from "react";

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{children}</h3>;
}

