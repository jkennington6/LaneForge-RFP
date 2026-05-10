import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Building2,
  Truck,
  ClipboardList,
  FileSpreadsheet,
  BarChart3,
  Route,
  ShieldCheck,
  Link2,
} from "lucide-react";
import { requireInternalPlatformUser } from "@/lib/portal-access";
import { BrandLogo } from "@/components/brand-logo";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Building2 },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/carriers", label: "Carriers", icon: Truck },
  { href: "/rfps", label: "RFPs", icon: ClipboardList },
  { href: "/bid-entry", label: "Bid Entry", icon: FileSpreadsheet },
  { href: "/comparisons", label: "Comparisons", icon: BarChart3 },
  { href: "/routing-guides", label: "Routing Guides", icon: Route },
  { href: "/admin/access", label: "Access Control", icon: ShieldCheck },
  { href: "/admin/rfp-visibility", label: "RFP Controls", icon: ShieldCheck },
  { href: "/admin/test-links", label: "Test Links", icon: Link2 },
];

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireInternalPlatformUser();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-72 border-r border-slate-200 bg-white p-4 lg:block">
        <div className="mb-8 rounded-3xl bg-slate-950 p-4 text-white shadow-sm">
          <BrandLogo variant="full" className="h-24 w-full rounded-2xl" />
          <p className="mt-3 text-xs text-slate-300">
            Freight bid management SaaS
          </p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p className="font-semibold text-slate-950">Signed in role</p>
          <p className="mt-1">{user.platform_role}</p>
          <p className="mt-2">
            Carrier/customer users are blocked from this master view.
          </p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <BrandLogo variant="icon" className="h-9 w-9" />
            <div>
              <p className="font-semibold text-slate-950">
                Freight RFP Platform
              </p>
              <p className="text-xs text-slate-500">Master admin view</p>
            </div>
          </div>

          <UserButton />
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
