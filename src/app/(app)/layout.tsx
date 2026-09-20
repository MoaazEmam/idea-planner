import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      {children}
    </div>
  );
}
