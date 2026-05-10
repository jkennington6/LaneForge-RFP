import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { BrandLogo } from "@/components/brand-logo";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <BrandLogo variant="icon" className="h-9 w-9" />
          <div>
            <p className="font-semibold text-slate-950">LaneForge RFP</p>
            <p className="text-xs text-slate-500">Freight bid management</p>
          </div>
        </Link>

        <UserButton />
      </header>

      <main className="p-6">{children}</main>
    </div>
  );
}
