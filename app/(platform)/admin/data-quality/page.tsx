import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function text(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function num(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && value !== "") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return 0;
}

function pct(value: number) {
  return value.toLocaleString("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function statusClass(value: "good" | "warning" | "blocked") {
  if (value === "good") return "border-green-200 bg-green-50 text-green-800";
  if (value === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

export default async function DataQualityPage() {
  const supabase = createServiceSupabaseClient();

  const [lanesResult, validationResult, submissionsResult] = await Promise.all([
    supabase.from("shipment_lanes").select("*").limit(5000),
    supabase.from("carrier_bid_validation_errors").select("id, error_type, error_message, row_number").limit(5000),
    supabase.from("carrier_bid_submissions").select("id, carrier_name, status, original_filename, created_at").limit(500),
  ]);

  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const validationErrors = (validationResult.data ?? []) as AnyRow[];
  const submissions = (submissionsResult.data ?? []) as AnyRow[];

  const totalLanes = lanes.length;

  const missingOriginZip = lanes.filter((lane) => !text(lane, ["origin_zip", "origin_postal_code", "origin"])).length;
  const missingDestinationZip = lanes.filter((lane) => !text(lane, ["destination_zip", "dest_zip", "destination_postal_code", "destination"])).length;
  const missingStatePair = lanes.filter((lane) => !text(lane, ["lane_state_pair", "state_pair"])).length;
  const missingWeight = lanes.filter((lane) => num(lane, ["weight", "total_weight", "shipment_weight", "average_weight"]) <= 0).length;
  const missingHistoricalSpend = lanes.filter((lane) => num(lane, ["historical_spend", "current_spend", "current_total", "total_spend", "spend"]) <= 0).length;
  const missingClass = lanes.filter((lane) => !text(lane, ["freight_class", "actual_class", "class"])).length;
  const missingShipmentCount = lanes.filter((lane) => num(lane, ["shipment_count", "shipments", "count"]) <= 0).length;

  const checks = [
    {
      label: "Origin ZIP",
      issueCount: missingOriginZip,
      detail: "Every lane should have a usable origin ZIP or origin postal value.",
      priority: "critical",
    },
    {
      label: "Destination ZIP",
      issueCount: missingDestinationZip,
      detail: "Every lane should have a usable destination ZIP or postal value.",
      priority: "critical",
    },
    {
      label: "State Pair",
      issueCount: missingStatePair,
      detail: "State-pair analytics and geography summaries work best when this is populated.",
      priority: "high",
    },
    {
      label: "Weight",
      issueCount: missingWeight,
      detail: "LTL pricing and bid comparison are weaker when weight is missing.",
      priority: "critical",
    },
    {
      label: "Historical Spend",
      issueCount: missingHistoricalSpend,
      detail: "Savings analytics require baseline spend.",
      priority: "critical",
    },
    {
      label: "Freight Class",
      issueCount: missingClass,
      detail: "LTL bids become more conservative when class is missing.",
      priority: "high",
    },
    {
      label: "Shipment Count",
      issueCount: missingShipmentCount,
      detail: "Volume-weighted analytics require shipment counts.",
      priority: "high",
    },
  ];

  const criticalIssues = checks
    .filter((check) => check.priority === "critical")
    .reduce((sum, check) => sum + check.issueCount, 0);

  const warningIssues = checks
    .filter((check) => check.priority !== "critical")
    .reduce((sum, check) => sum + check.issueCount, 0);

  const validationErrorCount = validationErrors.length;

  let qualityScore = 100;

  if (totalLanes === 0) qualityScore -= 35;
  qualityScore -= Math.min(45, criticalIssues * 2);
  qualityScore -= Math.min(25, warningIssues);
  qualityScore -= Math.min(30, validationErrorCount * 2);

  qualityScore = Math.max(0, Math.min(100, qualityScore));

  const overallStatus =
    qualityScore >= 85 ? "good" : qualityScore >= 65 ? "warning" : "blocked";

  const sampleBadLanes = lanes
    .filter((lane) => {
      return (
        !text(lane, ["origin_zip", "origin_postal_code", "origin"]) ||
        !text(lane, ["destination_zip", "dest_zip", "destination_postal_code", "destination"]) ||
        num(lane, ["weight", "total_weight", "shipment_weight", "average_weight"]) <= 0 ||
        num(lane, ["historical_spend", "current_spend", "current_total", "total_spend", "spend"]) <= 0
      );
    })
    .slice(0, 25);

  return (
    <div>
      <SectionHeader
        title="Data Quality Readiness"
        description="Pre-beta data checks for shipment lanes, carrier bid submissions, and validation errors."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/go-live" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Go-Live
            </Link>
            <Link href="/admin/e2e-rfp-test" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
              E2E Test
            </Link>
            <Link href="/rfps" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              RFPs
            </Link>
          </div>
        }
      />

      {(lanesResult.error || validationResult.error || submissionsResult.error) && (
        <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <h2 className="font-semibold text-red-950">Data query error</h2>
          <p className="mt-1">
            {lanesResult.error?.message ?? validationResult.error?.message ?? submissionsResult.error?.message}
          </p>
        </section>
      )}

      <section className={`mb-6 rounded-2xl border p-6 shadow-sm ${statusClass(overallStatus)}`}>
        <p className="text-sm font-semibold uppercase tracking-wide">Data Quality Score</p>
        <h2 className="mt-2 text-4xl font-bold">{qualityScore}/100</h2>
        <p className="mt-2 text-sm font-semibold">
          {overallStatus === "good"
            ? "Strong enough for controlled beta testing"
            : overallStatus === "warning"
              ? "Usable, but review data gaps before customer release"
              : "Not ready for customer-facing analytics"}
        </p>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Lanes Reviewed</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{totalLanes.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-slate-500">Limited to first 5,000 rows</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm text-red-700">Critical Data Gaps</p>
          <p className="mt-2 text-2xl font-bold text-red-950">{criticalIssues.toLocaleString("en-US")}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm text-amber-700">Warning Data Gaps</p>
          <p className="mt-2 text-2xl font-bold text-amber-950">{warningIssues.toLocaleString("en-US")}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Validation Errors</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{validationErrorCount.toLocaleString("en-US")}</p>
        </div>
      </section>

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Data Quality Checks</h2>
          <p className="mt-1 text-sm text-slate-600">
            These fields drive pricing, savings analytics, coverage analytics, and customer reporting.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Check</th>
              <th className="px-4 py-3">Issues</th>
              <th className="px-4 py-3">Issue Rate</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {checks.map((check) => {
              const issueRate = totalLanes > 0 ? check.issueCount / totalLanes : 0;
              const status = check.issueCount === 0 ? "good" : check.priority === "critical" ? "blocked" : "warning";

              return (
                <tr key={check.label}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{check.label}</td>
                  <td className="px-4 py-3 text-slate-600">{check.issueCount.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 text-slate-600">{pct(issueRate)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>
                      {check.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{check.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Recent Carrier Bid Submissions</h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {submissions.slice(0, 15).map((submission) => (
              <tr key={String(submission.id)}>
                <td className="px-4 py-3 font-semibold text-slate-950">{submission.carrier_name ?? "Unknown Carrier"}</td>
                <td className="px-4 py-3 text-slate-600">{submission.status ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{submission.original_filename ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{submission.created_at ?? "-"}</td>
              </tr>
            ))}
            {!submissions.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={4}>
                  No carrier bid submissions found yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Sample Lane Records With Critical Gaps</h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lane ID</th>
              <th className="px-4 py-3">Origin</th>
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">Historical Spend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sampleBadLanes.map((lane) => (
              <tr key={String(lane.id)}>
                <td className="px-4 py-3 font-semibold text-slate-950">{String(lane.id ?? "-").slice(0, 12)}</td>
                <td className="px-4 py-3 text-slate-600">{text(lane, ["origin_zip", "origin_postal_code", "origin"]) || "Missing"}</td>
                <td className="px-4 py-3 text-slate-600">{text(lane, ["destination_zip", "dest_zip", "destination_postal_code", "destination"]) || "Missing"}</td>
                <td className="px-4 py-3 text-slate-600">{num(lane, ["weight", "total_weight", "shipment_weight", "average_weight"]) || "Missing"}</td>
                <td className="px-4 py-3 text-slate-600">{num(lane, ["historical_spend", "current_spend", "current_total", "total_spend", "spend"]) || "Missing"}</td>
              </tr>
            ))}
            {!sampleBadLanes.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No sample critical lane gaps found in the reviewed rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}