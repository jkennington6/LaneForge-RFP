import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type CountResult = {
  label: string;
  table: string;
  count: number | null;
  error: string | null;
  critical: boolean;
};

type ChecklistItem = {
  area: string;
  item: string;
  status: "not-started" | "in-progress" | "needs-testing" | "ready";
  priority: "critical" | "high" | "medium";
  ownerNote: string;
};

function statusClass(status: ChecklistItem["status"]) {
  if (status === "ready") return "border-green-200 bg-green-50 text-green-800";
  if (status === "in-progress") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "needs-testing") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function priorityClass(priority: ChecklistItem["priority"]) {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function scoreClass(score: number) {
  if (score >= 85) return "border-green-200 bg-green-50 text-green-900";
  if (score >= 65) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function scoreLabel(score: number) {
  if (score >= 85) return "Beta-ready after final smoke test";
  if (score >= 65) return "Close, but needs cleanup/testing";
  return "Not ready for external users";
}

async function safeCount(table: string, label: string, critical = false): Promise<CountResult> {
  const supabase = createServiceSupabaseClient();

  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  return {
    label,
    table,
    count: count ?? null,
    error: error?.message ?? null,
    critical,
  };
}

export default async function GoLiveReadinessPage() {
  const supabase = createServiceSupabaseClient();

  const [
    rfpCount,
    orgCount,
    customerCount,
    inviteCount,
    submissionCount,
    laneCount,
    awardCount,
    releaseCount,
    validationErrorCount,
  ] = await Promise.all([
    safeCount("rfps", "RFPs", true),
    safeCount("organizations", "Organizations", true),
    safeCount("customers", "Customers", true),
    safeCount("rfp_carrier_invites", "Carrier Invites", true),
    safeCount("carrier_bid_submissions", "Carrier Bid Submissions", true),
    safeCount("shipment_lanes", "Shipment Lanes", true),
    safeCount("rfp_lane_awards", "Lane Awards", true),
    safeCount("rfp_customer_release_settings", "Customer Release Settings", true),
    safeCount("carrier_bid_validation_errors", "Bid Validation Errors", false),
  ]);

  const counts = [
    rfpCount,
    orgCount,
    customerCount,
    inviteCount,
    submissionCount,
    laneCount,
    awardCount,
    releaseCount,
    validationErrorCount,
  ];

  const { data: recentRfps, error: recentRfpsError } = await supabase
    .from("rfps")
    .select("id, name, mode, status, bid_due_date, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  const brokenCriticalTables = counts.filter((row) => row.critical && row.error).length;
  const totalValidationErrors = validationErrorCount.count ?? 0;

  let readinessScore = 100;

  if (brokenCriticalTables > 0) readinessScore -= brokenCriticalTables * 15;
  if ((rfpCount.count ?? 0) === 0) readinessScore -= 20;
  if ((customerCount.count ?? 0) === 0) readinessScore -= 15;
  if ((laneCount.count ?? 0) === 0) readinessScore -= 15;
  if ((submissionCount.count ?? 0) === 0) readinessScore -= 10;
  if ((awardCount.count ?? 0) === 0) readinessScore -= 10;
  if (totalValidationErrors > 0) readinessScore -= Math.min(25, totalValidationErrors * 2);

  readinessScore = Math.max(0, Math.min(100, readinessScore));

  const productionRoutes = [
    { label: "Home", href: "/" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Internal RFPs", href: "/rfps" },
    { label: "Customers", href: "/customers" },
    { label: "Carriers", href: "/carriers" },
    { label: "Customer Portal", href: "/customer" },
    { label: "Carrier Portal", href: "/carrier" },
    { label: "Admin Access", href: "/admin/access" },
    { label: "RFP Visibility", href: "/admin/rfp-visibility" },
    { label: "Test Links", href: "/admin/test-links" },
  ];

  const smokeTests: ChecklistItem[] = [
    {
      area: "Production",
      item: "laneforge.org loads without 404 or page crash",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "Check after every Vercel production deploy.",
    },
    {
      area: "Production",
      item: "/rfps loads and every RFP detail link opens",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "This is the current stabilization focus.",
    },
    {
      area: "Auth",
      item: "Clerk production sign-in and sign-up work",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "Verify live keys are real pk_live and sk_live values, not hidden dots.",
    },
    {
      area: "Database",
      item: "Supabase production data loads correctly",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "RFPs, organizations, customers, lanes, bids, and awards must load.",
    },
    {
      area: "Customer Portal",
      item: "Customer can open released RFP package",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "Customer must not see hidden bid amounts, savings, or award details unless released.",
    },
    {
      area: "Carrier Portal",
      item: "Carrier invite and template route loads",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "Carrier should only see invited RFPs and their own submission flow.",
    },
    {
      area: "Analytics",
      item: "Internal analytics dashboards load",
      status: "needs-testing",
      priority: "high",
      ownerNote: "Main analytics, concentration, savings bridge, readiness, geography, risk, and coverage.",
    },
    {
      area: "Exports",
      item: "CSV exports download without crashing",
      status: "needs-testing",
      priority: "high",
      ownerNote: "Test analytics export, concentration export, savings export, and readiness export.",
    },
  ];

  const roleTests: ChecklistItem[] = [
    {
      area: "Platform Owner",
      item: "Can see and manage all RFPs, customers, carriers, and admin pages",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "Only true platform/admin users should have this access.",
    },
    {
      area: "3PL",
      item: "Can manage controlled customers and decide what those customers can see",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "Customer release settings must control visibility.",
    },
    {
      area: "Direct Customer",
      item: "Can only see their own RFPs and released customer-safe analytics",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "Direct customers should not require a 3PL relationship.",
    },
    {
      area: "3PL-Controlled Customer",
      item: "Can only see RFP package released by the managing 3PL",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "No raw carrier bid amounts or savings unless released.",
    },
    {
      area: "Carrier",
      item: "Can only see invited RFPs and cannot see competitor bids",
      status: "needs-testing",
      priority: "critical",
      ownerNote: "Carrier isolation is mandatory before beta.",
    },
    {
      area: "Suspended User",
      item: "Can be blocked quickly from accessing platform workflows",
      status: "not-started",
      priority: "high",
      ownerNote: "Still needs final owner-only suspension control.",
    },
  ];

  const goLivePhases = [
    {
      phase: "Phase 1",
      name: "Production Stabilization",
      status: "Current",
      detail: "Fix route crashes, RFP detail 404s, env issues, build failures, and Vercel production deploy consistency.",
    },
    {
      phase: "Phase 2",
      name: "Role-Based Security Testing",
      status: "Next",
      detail: "Test platform, 3PL, customer, 3PL-controlled customer, and carrier access boundaries.",
    },
    {
      phase: "Phase 3",
      name: "End-to-End Mock RFP",
      status: "Next",
      detail: "Create RFP, upload lanes, invite carrier, submit bid, compare, award, release customer view, export reports.",
    },
    {
      phase: "Phase 4",
      name: "Analytics Validation",
      status: "Upcoming",
      detail: "Tie dashboard numbers to source data: baseline spend, awarded spend, savings, coverage, and routing guide output.",
    },
    {
      phase: "Phase 5",
      name: "Private Beta",
      status: "Upcoming",
      detail: "Use one controlled mock customer and one or two controlled carriers before any real customer launch.",
    },
  ];

  return (
    <div>
      <SectionHeader
        title="Go-Live Readiness"
        description="Internal launch control center for LaneForge production stabilization, role testing, and beta readiness."
        action={
          <div className="flex flex-wrap gap-2">

            <Link
              href="/admin/e2e-rfp-test"
              className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
            >
              E2E Test
            </Link>

            <Link
              href="/admin/security-matrix"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Security Matrix
            </Link>

            <Link
              href="/admin/data-quality"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              Data Quality
            </Link>
            <Link
              href="/rfps"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              RFPs
            </Link>

            <Link
              href="/admin/access"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Admin Access
            </Link>

            <Link
              href="/admin/system-health"
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              System Health
            </Link>

            <Link
              href="/admin/test-links"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              Test Links
            </Link>

            <Link
              href="/dashboard"
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Dashboard
            </Link>
          </div>
        }
      />

      <section className={`mb-6 rounded-2xl border p-6 shadow-sm ${scoreClass(readinessScore)}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide">Current Readiness Score</p>
            <h2 className="mt-2 text-4xl font-bold">{readinessScore}/100</h2>
            <p className="mt-2 text-sm font-semibold">{scoreLabel(readinessScore)}</p>
          </div>

          <div className="max-w-xl text-sm leading-6">
            <p>
              This score is a directional internal readiness indicator. It checks whether core production tables are reachable, whether basic RFP data exists, and whether validation errors are present. It does not replace manual role/security testing.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {counts.map((row) => (
          <div
            key={row.table}
            className={`rounded-2xl border bg-white p-5 shadow-sm ${
              row.error ? "border-red-200" : "border-slate-200"
            }`}
          >
            <p className="text-sm text-slate-500">{row.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {row.error ? "Error" : (row.count ?? 0).toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-xs text-slate-500">{row.table}</p>
            {row.error && (
              <p className="mt-2 text-xs text-red-700">{row.error}</p>
            )}
          </div>
        ))}
      </section>

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Go-Live Phase Plan</h2>
          <p className="mt-1 text-sm text-slate-600">
            This is the current launch path. We are in stabilization before adding more outside users.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Phase</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {goLivePhases.map((phase) => (
              <tr key={phase.phase}>
                <td className="px-4 py-3 font-semibold text-slate-950">{phase.phase}</td>
                <td className="px-4 py-3 text-slate-700">{phase.name}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
                    {phase.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{phase.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Production Route Smoke Test</h2>
        <p className="mt-1 text-sm text-slate-600">
          Open these after every deploy. Any 404, page crash, or auth loop blocks go-live.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {productionRoutes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              {route.label}
              <span className="mt-1 block text-xs font-normal text-slate-500">
                {route.href}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-950">Production Smoke-Test Checklist</h2>
            <p className="mt-1 text-sm text-slate-600">
              These are the minimum production checks before private beta.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {smokeTests.map((test) => (
              <div key={`${test.area}-${test.item}`} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{test.area}</p>
                    <p className="mt-1 font-semibold text-slate-950">{test.item}</p>
                    <p className="mt-1 text-sm text-slate-600">{test.ownerNote}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">

            <Link
              href="/admin/e2e-rfp-test"
              className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
            >
              E2E Test
            </Link>

            <Link
              href="/admin/security-matrix"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Security Matrix
            </Link>

            <Link
              href="/admin/data-quality"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              Data Quality
            </Link>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${priorityClass(test.priority)}`}>
                      {test.priority}
                    </span>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(test.status)}`}>
                      {test.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-950">Role and Security Checklist</h2>
            <p className="mt-1 text-sm text-slate-600">
              These checks protect customer/carrier data and should be tested before external use.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {roleTests.map((test) => (
              <div key={`${test.area}-${test.item}`} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{test.area}</p>
                    <p className="mt-1 font-semibold text-slate-950">{test.item}</p>
                    <p className="mt-1 text-sm text-slate-600">{test.ownerNote}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">

            <Link
              href="/admin/e2e-rfp-test"
              className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
            >
              E2E Test
            </Link>

            <Link
              href="/admin/security-matrix"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Security Matrix
            </Link>

            <Link
              href="/admin/data-quality"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              Data Quality
            </Link>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${priorityClass(test.priority)}`}>
                      {test.priority}
                    </span>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(test.status)}`}>
                      {test.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Recent RFPs for Link Testing</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use these links to confirm RFP detail pages work after every deploy.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">RFP</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Bid Due</th>
              <th className="px-4 py-3">Links</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {(recentRfps ?? []).map((rfp) => (
              <tr key={String(rfp.id)}>
                <td className="px-4 py-3 font-semibold text-slate-950">{rfp.name}</td>
                <td className="px-4 py-3 text-slate-600">{rfp.mode ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{rfp.status ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{rfp.bid_due_date ?? "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">

            <Link
              href="/admin/e2e-rfp-test"
              className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
            >
              E2E Test
            </Link>

            <Link
              href="/admin/security-matrix"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Security Matrix
            </Link>

            <Link
              href="/admin/data-quality"
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              Data Quality
            </Link>
                    <Link
                      href={`/rfps/${rfp.id}`}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Detail
                    </Link>
                    <Link
                      href={`/rfps/${rfp.id}/analytics`}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      Analytics
                    </Link>
                    <Link
                      href={`/rfps/${rfp.id}/analytics/readiness`}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      Readiness
                    </Link>
                  </div>
                </td>
              </tr>
            ))}

            {recentRfpsError && (
              <tr>
                <td className="px-4 py-6 text-red-700" colSpan={5}>
                  Recent RFP query error: {recentRfpsError.message}
                </td>
              </tr>
            )}

            {!recentRfpsError && !(recentRfps ?? []).length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No RFPs found yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}