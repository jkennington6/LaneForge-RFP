import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { CountBarChart, MoneyBarChart } from "@/components/analytics-charts";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type RiskRow = {
  laneId: string;
  laneName: string;
  category: string;
  severity: "high" | "medium" | "low";
  detail: string;
  carrierOptions: number;
  historicalSpend: number;
  awardedCost: number | null;
  savings: number | null;
};

function numberValue(row: AnyRow | null | undefined, keys: string[], fallback = 0) {
  if (!row) return fallback;

  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && value !== "") {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);

  return parsed.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function getSubmission(rate: AnyRow) {
  return Array.isArray(rate.carrier_bid_submissions)
    ? rate.carrier_bid_submissions[0]
    : rate.carrier_bid_submissions;
}

function getCarrierName(rate: AnyRow) {
  const submission = getSubmission(rate);
  return String(submission?.carrier_name ?? rate.carrier_name ?? "Unknown Carrier");
}

function isActiveRate(rate: AnyRow) {
  const submission = getSubmission(rate);
  return submission?.is_active !== false;
}

function matchesLane(rate: AnyRow, lane: AnyRow) {
  if (rate.lane_id && lane.id && String(rate.lane_id) === String(lane.id)) return true;

  const originZipMatch =
    rate.origin_zip &&
    lane.origin_zip &&
    String(rate.origin_zip).trim() === String(lane.origin_zip).trim();

  const destinationZipMatch =
    rate.destination_zip &&
    lane.destination_zip &&
    String(rate.destination_zip).trim() === String(lane.destination_zip).trim();

  const weightBreakMatch =
    !rate.weight_break ||
    !lane.weight_break ||
    String(rate.weight_break).trim() === String(lane.weight_break).trim();

  const classMatch =
    !rate.freight_class ||
    !lane.freight_class ||
    String(rate.freight_class).trim() === String(lane.freight_class).trim();

  return Boolean(originZipMatch && destinationZipMatch && weightBreakMatch && classMatch);
}

function laneName(lane: AnyRow) {
  return `${lane.lane_state_pair ?? "Lane"} - ${lane.origin_zip ?? "-"} to ${lane.destination_zip ?? "-"}`;
}

function severityClass(severity: "high" | "medium" | "low") {
  if (severity === "high") return "bg-red-50 text-red-700 border-red-200";
  if (severity === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function savingsClass(value: number | null) {
  if ((value ?? 0) > 0) return "text-green-700";
  if ((value ?? 0) < 0) return "text-red-700";
  return "text-slate-600";
}

function severityRank(severity: "high" | "medium" | "low") {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

export default async function RiskOpportunityAnalyticsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, lanesResult, awardsResult, ratesResult, validationErrorsResult] =
    await Promise.all([
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
        .from("carrier_bid_lane_rates")
        .select(`
          *,
          carrier_bid_submissions (
            carrier_name,
            is_active
          )
        `)
        .eq("rfp_id", rfpId),

      supabase
        .from("carrier_bid_validation_errors")
        .select("id, row_number, error_type, error_message")
        .eq("rfp_id", rfpId),
    ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);
  if (ratesResult.error) throw new Error(ratesResult.error.message);
  if (validationErrorsResult.error) throw new Error(validationErrorsResult.error.message);

  const rfp = rfpResult.data;
  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];
  const rates = ((ratesResult.data ?? []) as AnyRow[]).filter(isActiveRate);
  const validationErrors = (validationErrorsResult.data ?? []) as AnyRow[];

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => {
    awardsByLane.set(String(award.lane_id), award);
  });

  const carrierOptionsByLane = new Map<string, Set<string>>();

  lanes.forEach((lane) => {
    const carrierSet = new Set<string>();

    rates.forEach((rate) => {
      if (matchesLane(rate, lane)) {
        carrierSet.add(getCarrierName(rate));
      }
    });

    carrierOptionsByLane.set(String(lane.id), carrierSet);
  });

  const riskRows: RiskRow[] = [];

  lanes.forEach((lane) => {
    const award = awardsByLane.get(String(lane.id)) ?? null;
    const carrierOptions = carrierOptionsByLane.get(String(lane.id))?.size ?? 0;

    const historicalSpend = numberValue(lane, [
      "historical_spend",
      "current_spend",
      "current_total",
      "total_spend",
      "spend",
    ]);

    const awardedCost =
      award?.primary_estimated_cost !== null &&
      award?.primary_estimated_cost !== undefined
        ? Number(award.primary_estimated_cost)
        : null;

    const savings = awardedCost !== null ? historicalSpend - awardedCost : null;

    if (!award?.primary_carrier_name) {
      riskRows.push({
        laneId: String(lane.id),
        laneName: laneName(lane),
        category: "Unawarded Lane",
        severity: "high",
        detail: "No primary award is saved for this lane.",
        carrierOptions,
        historicalSpend,
        awardedCost,
        savings,
      });
    }

    if (carrierOptions === 0) {
      riskRows.push({
        laneId: String(lane.id),
        laneName: laneName(lane),
        category: "No Bid Coverage",
        severity: "high",
        detail: "No active carrier bid appears to cover this lane.",
        carrierOptions,
        historicalSpend,
        awardedCost,
        savings,
      });
    }

    if (carrierOptions === 1) {
      riskRows.push({
        laneId: String(lane.id),
        laneName: laneName(lane),
        category: "Single Carrier Option",
        severity: "medium",
        detail: "Only one active carrier option appears available. Backup coverage should be reviewed.",
        carrierOptions,
        historicalSpend,
        awardedCost,
        savings,
      });
    }

    if (savings !== null && savings < 0) {
      riskRows.push({
        laneId: String(lane.id),
        laneName: laneName(lane),
        category: "Negative Savings",
        severity: "medium",
        detail: "Awarded cost is higher than historical spend.",
        carrierOptions,
        historicalSpend,
        awardedCost,
        savings,
      });
    }

    if (historicalSpend === 0) {
      riskRows.push({
        laneId: String(lane.id),
        laneName: laneName(lane),
        category: "Missing Baseline Spend",
        severity: "low",
        detail: "Historical spend is missing or zero, so savings cannot be fully trusted.",
        carrierOptions,
        historicalSpend,
        awardedCost,
        savings,
      });
    }
  });

  const sortedRiskRows = riskRows.sort((a, b) => {
    const severityDifference = severityRank(b.severity) - severityRank(a.severity);

    if (severityDifference !== 0) return severityDifference;

    return Math.abs(b.savings ?? 0) - Math.abs(a.savings ?? 0);
  });

  const highRiskCount = riskRows.filter((row) => row.severity === "high").length;
  const mediumRiskCount = riskRows.filter((row) => row.severity === "medium").length;
  const lowRiskCount = riskRows.filter((row) => row.severity === "low").length;

  const negativeSavingsTotal = riskRows
    .filter((row) => row.category === "Negative Savings")
    .reduce((sum, row) => sum + Math.abs(row.savings ?? 0), 0);

  const topOpportunityRows = lanes
    .map((lane) => {
      const award = awardsByLane.get(String(lane.id)) ?? null;

      const historicalSpend = numberValue(lane, [
        "historical_spend",
        "current_spend",
        "current_total",
        "total_spend",
        "spend",
      ]);

      const awardedCost =
        award?.primary_estimated_cost !== null &&
        award?.primary_estimated_cost !== undefined
          ? Number(award.primary_estimated_cost)
          : null;

      const savings = awardedCost !== null ? historicalSpend - awardedCost : null;

      return {
        lane,
        award,
        historicalSpend,
        awardedCost,
        savings,
      };
    })
    .filter((row) => (row.savings ?? 0) > 0)
    .sort((a, b) => Number(b.savings ?? 0) - Number(a.savings ?? 0))
    .slice(0, 25);

  return (
    <div>
      <SectionHeader
        title="Risk & Opportunity Analytics"
        description={`${rfp.name} - lanes needing review before release or final award`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}/analytics`}
              className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
            >
              Analytics
            </Link>

            <Link
              href={`/rfps/${rfp.id}/analytics/geography`}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Geography
            </Link>

            <Link
              href={`/rfps/${rfp.id}/analytics/coverage`}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Coverage
            </Link>

            <Link
              href={`/rfps/${rfp.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to RFP
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm text-red-700">High Risk</p>
          <p className="mt-2 text-2xl font-bold text-red-950">{highRiskCount}</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm text-amber-700">Medium Risk</p>
          <p className="mt-2 text-2xl font-bold text-amber-950">{mediumRiskCount}</p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-sm text-blue-700">Low Risk</p>
          <p className="mt-2 text-2xl font-bold text-blue-950">{lowRiskCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Validation Errors</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {validationErrors.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Negative Savings Exposure</p>
          <p className="mt-2 text-2xl font-bold text-red-700">
            {money(negativeSavingsTotal)}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <CountBarChart
          title="Risk Items by Severity"
          description="High, medium, and low risk items currently identified."
          data={[
            {
              label: "High Risk",
              value: highRiskCount,
              detail: "Unawarded or no-bid coverage concerns",
            },
            {
              label: "Medium Risk",
              value: mediumRiskCount,
              detail: "Single-carrier or negative savings concerns",
            },
            {
              label: "Low Risk",
              value: lowRiskCount,
              detail: "Baseline/data quality concerns",
            },
          ]}
        />

        <CountBarChart
          title="Risk Items by Category"
          description="Most common risk types in the current RFP."
          data={Array.from(
            riskRows.reduce((map, row) => {
              map.set(row.category, (map.get(row.category) ?? 0) + 1);
              return map;
            }, new Map<string, number>())
          )
            .map(([label, value]) => ({
              label,
              value,
              detail: "Risk item count",
            }))
            .sort((a, b) => b.value - a.value)}
        />

        <MoneyBarChart
          title="Top Savings Opportunities"
          description="Largest positive savings lanes from current awards."
          data={topOpportunityRows.slice(0, 12).map((row) => ({
            label: laneName(row.lane),
            value: Number(row.savings ?? 0),
            detail: String(row.award?.primary_carrier_name ?? "Awarded carrier"),
          }))}
        />
      </div>
      <section className="mb-6 overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
        <div className="border-b border-red-200 bg-red-50 p-5">
          <h2 className="text-lg font-semibold text-red-950">
            Risk Review Queue
          </h2>
          <p className="mt-1 text-sm text-red-800">
            Lanes with award, coverage, savings, or data quality concerns.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Lane</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3">Carrier Options</th>
                <th className="px-4 py-3">Historical</th>
                <th className="px-4 py-3">Awarded</th>
                <th className="px-4 py-3">Savings</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {sortedRiskRows.slice(0, 100).map((row, index) => (
                <tr key={`${row.laneId}-${row.category}-${index}`}>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityClass(row.severity)}`}>
                      {row.severity.toUpperCase()}
                    </span>
                  </td>

                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {row.category}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {row.laneName}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {row.detail}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {row.carrierOptions}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {money(row.historicalSpend)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {row.awardedCost !== null ? money(row.awardedCost) : "-"}
                  </td>

                  <td className={`px-4 py-3 font-semibold ${savingsClass(row.savings)}`}>
                    {row.savings !== null ? money(row.savings) : "-"}
                  </td>
                </tr>
              ))}

              {!sortedRiskRows.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={8}>
                    No risk items are currently identified.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {sortedRiskRows.length > 100 && (
          <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            Showing first 100 risk rows of {sortedRiskRows.length}.
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-green-200 bg-white shadow-sm">
        <div className="border-b border-green-200 bg-green-50 p-5">
          <h2 className="text-lg font-semibold text-green-950">
            Top Opportunity Lanes
          </h2>
          <p className="mt-1 text-sm text-green-800">
            Highest estimated savings lanes from current awards.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Historical</th>
              <th className="px-4 py-3">Awarded</th>
              <th className="px-4 py-3">Savings</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {topOpportunityRows.map((row) => (
              <tr key={String(row.lane.id)}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {laneName(row.lane)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {row.award?.primary_carrier_name ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(row.historicalSpend)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {row.awardedCost !== null ? money(row.awardedCost) : "-"}
                </td>

                <td className="px-4 py-3 font-semibold text-green-700">
                  {money(row.savings)}
                </td>
              </tr>
            ))}

            {!topOpportunityRows.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No savings opportunity lanes are available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}