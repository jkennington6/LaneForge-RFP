import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function statusClass(status: "blocked" | "manual-test" | "ready") {
  if (status === "ready") return "border-green-200 bg-green-50 text-green-800";
  if (status === "blocked") return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

export default async function EndToEndRfpTestPage() {
  const supabase = createServiceSupabaseClient();

  const [
    rfpsResult,
    customersResult,
    lanesResult,
    invitesResult,
    submissionsResult,
    awardsResult,
    releaseResult,
  ] = await Promise.all([
    supabase.from("rfps").select("id, name, status, mode, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(10),
    supabase.from("customers").select("id"),
    supabase.from("shipment_lanes").select("id"),
    supabase.from("rfp_carrier_invites").select("id"),
    supabase.from("carrier_bid_submissions").select("id"),
    supabase.from("rfp_lane_awards").select("id"),
    supabase.from("rfp_customer_release_settings").select("id"),
  ]);

  const recentRfps = (rfpsResult.data ?? []) as AnyRow[];

  const counts = {
    rfps: recentRfps.length,
    customers: customersResult.data?.length ?? 0,
    lanes: lanesResult.data?.length ?? 0,
    invites: invitesResult.data?.length ?? 0,
    submissions: submissionsResult.data?.length ?? 0,
    awards: awardsResult.data?.length ?? 0,
    releaseSettings: releaseResult.data?.length ?? 0,
  };

  const blockers = [
    rfpsResult.error ? `RFP query error: ${rfpsResult.error.message}` : null,
    customersResult.error ? `Customer query error: ${customersResult.error.message}` : null,
    lanesResult.error ? `Shipment lane query error: ${lanesResult.error.message}` : null,
    invitesResult.error ? `Carrier invite query error: ${invitesResult.error.message}` : null,
    submissionsResult.error ? `Bid submission query error: ${submissionsResult.error.message}` : null,
    awardsResult.error ? `Lane award query error: ${awardsResult.error.message}` : null,
    releaseResult.error ? `Customer release query error: ${releaseResult.error.message}` : null,
  ].filter(Boolean);

  const testSteps = [
    {
      step: 1,
      area: "Customer Setup",
      task: "Create or verify one direct customer and one 3PL-controlled customer.",
      route: "/customers",
      status: counts.customers > 0 ? "manual-test" : "blocked",
      passCriteria: "Customer records exist and are tied to the correct organization relationship.",
    },
    {
      step: 2,
      area: "RFP Creation",
      task: "Create a mock LTL RFP with due date, effective date, fuel assumptions, and accessorial assumptions.",
      route: "/rfps",
      status: counts.rfps > 0 ? "manual-test" : "blocked",
      passCriteria: "RFP appears in the RFP list and detail page opens without 404.",
    },
    {
      step: 3,
      area: "Shipment Lanes",
      task: "Upload or create a small controlled lane set with at least 5 lanes.",
      route: "/rfps",
      status: counts.lanes > 0 ? "manual-test" : "blocked",
      passCriteria: "Lanes appear under the RFP and analytics can read the lane data.",
    },
    {
      step: 4,
      area: "Carrier Invites",
      task: "Invite at least one mock carrier to the RFP.",
      route: "/carriers",
      status: counts.invites > 0 ? "manual-test" : "blocked",
      passCriteria: "Carrier invite exists and invite route/template route loads.",
    },
    {
      step: 5,
      area: "Carrier Bid",
      task: "Submit one clean mock carrier bid and one intentionally bad bid.",
      route: "/carrier",
      status: counts.submissions > 0 ? "manual-test" : "blocked",
      passCriteria: "Good bid imports; bad bid creates useful validation errors without crashing.",
    },
    {
      step: 6,
      area: "Bid Comparison",
      task: "Review carrier bid results and verify lane-level pricing appears correctly.",
      route: "/rfps",
      status: counts.submissions > 0 ? "manual-test" : "blocked",
      passCriteria: "Internal user can compare carrier costs without exposing data to customer/carrier users.",
    },
    {
      step: 7,
      area: "Awards",
      task: "Award lanes to primary/backup/third carriers.",
      route: "/rfps",
      status: counts.awards > 0 ? "manual-test" : "blocked",
      passCriteria: "Awards save, persist after refresh, and feed analytics pages.",
    },
    {
      step: 8,
      area: "Analytics",
      task: "Open analytics, geography, coverage, risk, concentration, savings, and readiness dashboards.",
      route: "/admin/test-links",
      status: counts.awards > 0 ? "manual-test" : "blocked",
      passCriteria: "Dashboards load, totals make sense, and no route crashes occur.",
    },
    {
      step: 9,
      area: "Customer Release",
      task: "Configure customer release settings and publish a customer-safe view.",
      route: "/admin/rfp-visibility",
      status: counts.releaseSettings > 0 ? "manual-test" : "blocked",
      passCriteria: "Customer only sees released fields, not hidden bids/savings/carrier names.",
    },
    {
      step: 10,
      area: "Exports",
      task: "Download analytics, readiness, savings, and concentration CSV exports.",
      route: "/admin/test-links",
      status: counts.awards > 0 ? "manual-test" : "blocked",
      passCriteria: "Exports download and tie to dashboard totals.",
    },
  ] as const;

  const blockedCount = testSteps.filter((step) => step.status === "blocked").length;
  const manualCount = testSteps.filter((step) => step.status === "manual-test").length;

  return (
    <div>
      <SectionHeader
        title="End-to-End Mock RFP Test"
        description="Private beta rehearsal checklist for proving LaneForge can run a full RFP from setup through customer release."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/go-live" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Go-Live
            </Link>
            <Link href="/admin/test-links" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
              Test Links
            </Link>
            <Link href="/rfps" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              RFPs
            </Link>
          </div>
        }
      />

      {blockers.length > 0 && (
        <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <h2 className="font-semibold text-red-950">Database blockers found</h2>
          <ul className="mt-2 list-inside list-disc">
            {blockers.map((blocker) => (
              <li key={String(blocker)}>{blocker}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Blocked Steps</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{blockedCount}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm text-amber-700">Manual Tests Ready</p>
          <p className="mt-2 text-2xl font-bold text-amber-950">{manualCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">RFPs</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{formatNumber(counts.rfps)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Lane Awards</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{formatNumber(counts.awards)}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Mock RFP Test Steps</h2>
          <p className="mt-1 text-sm text-slate-600">
            Complete these in order. If one fails, pause new features and fix the break.
          </p>
        </div>

        <div className="divide-y divide-slate-200">
          {testSteps.map((step) => (
            <div key={step.step} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Step {step.step} - {step.area}
                  </p>
                  <h3 className="mt-1 font-semibold text-slate-950">{step.task}</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Pass criteria: {step.passCriteria}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(step.status)}`}>
                    {step.status}
                  </span>
                  <Link href={step.route} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Open Route
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Recent RFPs</h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">RFP</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Test</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {recentRfps.map((rfp) => (
              <tr key={String(rfp.id)}>
                <td className="px-4 py-3 font-semibold text-slate-950">{rfp.name}</td>
                <td className="px-4 py-3 text-slate-600">{rfp.mode ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{rfp.status ?? "-"}</td>
                <td className="px-4 py-3">
                  <Link href={`/rfps/${rfp.id}`} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
            {!recentRfps.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={4}>
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