import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function routeStatusLabel(priority: "critical" | "high" | "medium") {
  if (priority === "critical") return "Must Pass";
  if (priority === "high") return "Important";
  return "Helpful";
}

function priorityClass(priority: "critical" | "high" | "medium") {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default async function TestLinksPage() {
  const supabase = createServiceSupabaseClient();

  const { data: rfps, error: rfpsError } = await supabase
    .from("rfps")
    .select("id, name, mode, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const coreRoutes = [
    {
      label: "E2E RFP Test",
      href: "/admin/e2e-rfp-test",
      area: "Admin",
      priority: "high" as const,
      note: "Full mock RFP go-live rehearsal.",
    },
    {
      label: "Security Matrix",
      href: "/admin/security-matrix",
      area: "Admin",
      priority: "critical" as const,
      note: "Role and visibility testing plan.",
    },
    {
      label: "Data Quality",
      href: "/admin/data-quality",
      area: "Admin",
      priority: "high" as const,
      note: "Shipment lane and bid data quality readiness.",
    },
    {
      label: "Home",
      href: "/",
      area: "Public",
      priority: "critical" as const,
      note: "Base production domain should load.",
    },
    {
      label: "Dashboard",
      href: "/dashboard",
      area: "Platform",
      priority: "critical" as const,
      note: "Primary internal landing page.",
    },
    {
      label: "RFP List",
      href: "/rfps",
      area: "Platform",
      priority: "critical" as const,
      note: "Current major stabilization route.",
    },
    {
      label: "Customers",
      href: "/customers",
      area: "Platform",
      priority: "critical" as const,
      note: "Customer/account management.",
    },
    {
      label: "Carriers",
      href: "/carriers",
      area: "Platform",
      priority: "high" as const,
      note: "Carrier management.",
    },
    {
      label: "Customer Portal",
      href: "/customer",
      area: "Customer",
      priority: "critical" as const,
      note: "Customer-facing entry point.",
    },
    {
      label: "Carrier Portal",
      href: "/carrier",
      area: "Carrier",
      priority: "critical" as const,
      note: "Carrier-facing entry point.",
    },
    {
      label: "Admin Access",
      href: "/admin/access",
      area: "Admin",
      priority: "critical" as const,
      note: "Owner/admin access controls.",
    },
    {
      label: "RFP Visibility",
      href: "/admin/rfp-visibility",
      area: "Admin",
      priority: "high" as const,
      note: "Customer release and visibility management.",
    },
    {
      label: "Go-Live Readiness",
      href: "/admin/go-live",
      area: "Admin",
      priority: "high" as const,
      note: "Launch readiness control center.",
    },
    {
      label: "System Health",
      href: "/admin/system-health",
      area: "Admin",
      priority: "high" as const,
      note: "Database and service checks.",
    },
    {
      label: "Health API",
      href: "/api/health",
      area: "API",
      priority: "high" as const,
      note: "JSON production health endpoint.",
    },
  ];

  const rfpRows = ((rfps ?? []) as AnyRow[]).map((rfp) => ({
    id: String(rfp.id),
    name: String(rfp.name ?? "Untitled RFP"),
    mode: String(rfp.mode ?? "-"),
    status: String(rfp.status ?? "-"),
    links: [
      {
        label: "Detail",
        href: `/rfps/${rfp.id}`,
        priority: "critical" as const,
      },
      {
        label: "Analytics",
        href: `/rfps/${rfp.id}/analytics`,
        priority: "critical" as const,
      },
      {
        label: "Geography",
        href: `/rfps/${rfp.id}/analytics/geography`,
        priority: "high" as const,
      },
      {
        label: "Coverage",
        href: `/rfps/${rfp.id}/analytics/coverage`,
        priority: "high" as const,
      },
      {
        label: "Risk",
        href: `/rfps/${rfp.id}/analytics/risk`,
        priority: "high" as const,
      },
      {
        label: "Concentration",
        href: `/rfps/${rfp.id}/analytics/concentration`,
        priority: "high" as const,
      },
      {
        label: "Savings",
        href: `/rfps/${rfp.id}/analytics/savings`,
        priority: "high" as const,
      },
      {
        label: "Readiness",
        href: `/rfps/${rfp.id}/analytics/readiness`,
        priority: "high" as const,
      },
      {
        label: "Executive",
        href: `/rfps/${rfp.id}/analytics/executive`,
        priority: "medium" as const,
      },
    ],
  }));

  return (
    <div>
      <SectionHeader
        title="Production Test Links"
        description="Open these links after each deploy to catch 404s, auth loops, broken analytics pages, and route crashes."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/go-live"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Go-Live
            </Link>

            <Link
              href="/admin/system-health"
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              System Health
            </Link>

            <Link
              href="/rfps"
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              RFPs
            </Link>
          </div>
        }
      />

      <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
        <h2 className="font-semibold text-amber-950">How to use this page</h2>
        <p className="mt-1">
          Open each critical link in production after every deploy. If any critical link returns 404, server error, blank page, or incorrect role visibility, pause feature work and fix that route first.
        </p>
      </section>

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Core Production Routes</h2>
          <p className="mt-1 text-sm text-slate-600">
            These are the platform-level routes that should be tested first.
          </p>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {coreRoutes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{route.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{route.href}</p>
                  <p className="mt-2 text-sm text-slate-600">{route.note}</p>
                </div>

                <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${priorityClass(route.priority)}`}>
                  {routeStatusLabel(route.priority)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Recent RFP Route Tests</h2>
          <p className="mt-1 text-sm text-slate-600">
            These catch the broken RFP detail and analytics route issues we have been stabilizing.
          </p>
        </div>

        {rfpsError && (
          <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            RFP query error: {rfpsError.message}
          </div>
        )}

        <div className="divide-y divide-slate-200">
          {rfpRows.map((rfp) => (
            <div key={rfp.id} className="p-5">
              <div className="mb-4">
                <h3 className="font-semibold text-slate-950">{rfp.name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {rfp.mode} - {rfp.status}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {rfp.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold hover:bg-slate-50 ${priorityClass(link.priority)}`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {!rfpsError && !rfpRows.length && (
            <div className="p-6 text-sm text-slate-500">
              No RFPs were found. Create an RFP before running RFP route tests.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}