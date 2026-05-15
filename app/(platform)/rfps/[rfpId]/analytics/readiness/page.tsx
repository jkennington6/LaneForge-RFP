import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type ReadinessIssue = {
  laneId: string;
  laneName: string;
  severity: "high" | "medium" | "low";
  category: string;
  detail: string;
};

function numberValue(row: AnyRow | null | undefined, keys: string[], fallback = 0) {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && value !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return fallback;
}

function percent(value: number) {
  if (!Number.isFinite(value)) return "0.0%";

  return value.toLocaleString("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function laneName(lane: AnyRow) {
  return `${lane.lane_state_pair ?? "Lane"} - ${lane.origin_zip ?? "-"} to ${lane.destination_zip ?? "-"}`;
}

function severityClass(severity: "high" | "medium" | "low") {
  if (severity === "high") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function severityRank(severity: "high" | "medium" | "low") {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

export default async function AwardReadinessAnalyticsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, lanesResult, awardsResult, validationErrorsResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, mode, status")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("shipment_lanes")
      .select("*")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_lane_awards")
      .select("*")
      .eq("rfp_id", rfpId),

    supabase
      .from("carrier_bid_validation_errors")
      .select("id, error_type, error_message, row_number")
      .eq("rfp_id", rfpId),
  ]);

  if (rfpResult.error || !rfpResult.data) notFound();
  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);
  if (validationErrorsResult.error) throw new Error(validationErrorsResult.error.message);

  const rfp = rfpResult.data;
  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];
  const validationErrors = (validationErrorsResult.data ?? []) as AnyRow[];

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => awardsByLane.set(String(award.lane_id), award));

  const issues: ReadinessIssue[] = [];

  let awardedLaneCount = 0;
  let negativeSavingsLaneCount = 0;
  let missingBaselineLaneCount = 0;
  let totalHistoricalSpend = 0;
  let totalAwardedCost = 0;

  lanes.forEach((lane) => {
    const award = awardsByLane.get(String(lane.id));
    const name = laneName(lane);

    const historicalSpend = numberValue(lane, [
      "historical_spend",
      "current_spend",
      "current_total",
      "total_spend",
      "spend",
    ]);

    totalHistoricalSpend += historicalSpend;

    const hasPrimaryCarrier = Boolean(String(award?.primary_carrier_name ?? "").trim());

    const awardedCost =
      award?.primary_estimated_cost !== null &&
      award?.primary_estimated_cost !== undefined
        ? Number(award.primary_estimated_cost)
        : null;

    if (hasPrimaryCarrier && awardedCost !== null) {
      awardedLaneCount += 1;
      totalAwardedCost += awardedCost;
    }

    if (!hasPrimaryCarrier) {
      issues.push({
        laneId: String(lane.id),
        laneName: name,
        severity: "high",
        category: "Missing Primary Award",
        detail: "No primary carrier is saved for this lane.",
      });
    }

    if (historicalSpend === 0) {
      missingBaselineLaneCount += 1;

      issues.push({
        laneId: String(lane.id),
        laneName: name,
        severity: "medium",
        category: "Missing Baseline Spend",
        detail: "Historical spend is zero or missing, so savings quality is limited.",
      });
    }

    if (awardedCost !== null && historicalSpend > 0 && awardedCost > historicalSpend) {
      negativeSavingsLaneCount += 1;

      issues.push({
        laneId: String(lane.id),
        laneName: name,
        severity: "medium",
        category: "Cost Increase",
        detail: `Awarded cost ${money(awardedCost)} is higher than historical spend ${money(historicalSpend)}.`,
      });
    }
  });

  validationErrors.forEach((error) => {
    issues.push({
      laneId: "",
      laneName: `Upload row ${error.row_number ?? "-"}`,
      severity: "medium",
      category: "Bid Validation Error",
      detail: `${error.error_type ?? "Validation"}: ${error.error_message ?? "Review required"}`,
    });
  });

  const sortedIssues = issues.sort((a, b) => {
    const severityDifference = severityRank(b.severity) - severityRank(a.severity);
    if (severityDifference !== 0) return severityDifference;
    return a.category.localeCompare(b.category);
  });

  const highIssueCount = issues.filter((issue) => issue.severity === "high").length;
  const mediumIssueCount = issues.filter((issue) => issue.severity === "medium").length;
  const lowIssueCount = issues.filter((issue) => issue.severity === "low").length;

  const awardCoverage = lanes.length > 0 ? awardedLaneCount / lanes.length : 0;
  const netSavings = totalHistoricalSpend - totalAwardedCost;
  const savingsPercent = totalHistoricalSpend > 0 ? netSavings / totalHistoricalSpend : 0;

  const issuePenalty =
    highIssueCount * 8 +
    mediumIssueCount * 3 +
    lowIssueCount * 1 +
    validationErrors.length * 2;

  const readinessScore = Math.max(0, Math.min(100, Math.round(100 - issuePenalty)));

  const releaseLabel =
    readinessScore >= 85 && highIssueCount === 0
      ? "Ready for release review"
      : readinessScore >= 65
        ? "Needs cleanup before release"
        : "Not ready for release";

  const releaseClass =
    readinessScore >= 85 && highIssueCount === 0
      ? "border-green-200 bg-green-50 text-green-800"
      : readinessScore >= 65
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-800";

  const categoryRows = Array.from(
    issues.reduce((map, issue) => {
      map.set(issue.category, (map.get(issue.category) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <SectionHeader
        title="Award Readiness Analytics"
        description={`${rfp.name} - release readiness, award completeness, and cleanup queue`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/rfps/${rfp.id}/analytics`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Analytics
            </Link>
            <Link href={`/rfps/${rfp.id}/analytics/concentration`} className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100">
              Concentration
            </Link>
            <Link href={`/rfps/${rfp.id}/analytics/savings`} className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100">
              Savings Bridge
            </Link>
            <Link href={`/rfps/${rfp.id}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Back to RFP
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <div className={`rounded-2xl border p-5 shadow-sm ${releaseClass}`}>
          <p className="text-sm">Readiness Score</p>
          <p className="mt-2 text-3xl font-bold">{readinessScore}</p>
          <p className="mt-1 text-xs font-semibold">{releaseLabel}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Award Coverage</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{percent(awardCoverage)}</p>
          <p className="mt-1 text-xs text-slate-500">{awardedLaneCount}/{lanes.length} lane(s)</p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm text-red-700">High Issues</p>
          <p className="mt-2 text-2xl font-bold text-red-950">{highIssueCount}</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm text-amber-700">Medium Issues</p>
          <p className="mt-2 text-2xl font-bold text-amber-950">{mediumIssueCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Net Savings</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{money(netSavings)}</p>
          <p className="mt-1 text-xs text-slate-500">{percent(savingsPercent)}</p>
        </div>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Issue Summary</h2>
          <p className="mt-1 text-sm text-slate-600">
            Prioritized cleanup categories before customer release.
          </p>

          <div className="mt-5 space-y-3">
            {categoryRows.map(([category, count]) => (
              <div key={category} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-950">{category}</span>
                <span className="font-bold text-slate-950">{count}</span>
              </div>
            ))}

            {!categoryRows.length && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                No readiness issues are currently identified.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Release Checklist</h2>

          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span>Award all lanes</span>
              <span className={awardedLaneCount === lanes.length ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
                {awardedLaneCount === lanes.length ? "Complete" : "Needs work"}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span>Review cost increase lanes</span>
              <span className={negativeSavingsLaneCount === 0 ? "font-semibold text-green-700" : "font-semibold text-amber-700"}>
                {negativeSavingsLaneCount} lane(s)
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span>Review missing baseline lanes</span>
              <span className={missingBaselineLaneCount === 0 ? "font-semibold text-green-700" : "font-semibold text-amber-700"}>
                {missingBaselineLaneCount} lane(s)
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span>Resolve bid validation errors</span>
              <span className={validationErrors.length === 0 ? "font-semibold text-green-700" : "font-semibold text-amber-700"}>
                {validationErrors.length} error(s)
              </span>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Readiness Review Queue</h2>
          <p className="mt-1 text-sm text-slate-600">
            Clean these items before releasing final analytics or award recommendations.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Lane / Row</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {sortedIssues.slice(0, 100).map((issue, index) => (
                <tr key={`${issue.laneId}-${issue.category}-${index}`}>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityClass(issue.severity)}`}>
                      {issue.severity.toUpperCase()}
                    </span>
                  </td>

                  <td className="px-4 py-3 font-semibold text-slate-950">{issue.category}</td>
                  <td className="px-4 py-3 text-slate-600">{issue.laneName}</td>
                  <td className="px-4 py-3 text-slate-600">{issue.detail}</td>
                </tr>
              ))}

              {!sortedIssues.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={4}>
                    No readiness issues are currently identified.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {sortedIssues.length > 100 && (
          <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            Showing first 100 readiness issues of {sortedIssues.length}.
          </div>
        )}
      </section>
    </div>
  );
}