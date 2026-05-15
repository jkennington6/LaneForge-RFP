import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { CountBarChart, MoneyBarChart } from "@/components/analytics-charts";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type GeoSummary = {
  key: string;
  laneCount: number;
  awardedLaneCount: number;
  shipmentCount: number;
  historicalSpend: number;
  awardedCost: number;
  savings: number;
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

function percent(value: number) {
  if (!Number.isFinite(value)) return "0.0%";

  return value.toLocaleString("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function savingsClass(value: number) {
  if (value > 0) return "text-green-700";
  if (value < 0) return "text-red-700";
  return "text-slate-600";
}

function heatClass(value: number, maxAbsValue: number) {
  if (!Number.isFinite(value) || maxAbsValue <= 0 || value === 0) {
    return "bg-slate-50 text-slate-700";
  }

  const intensity = Math.abs(value) / maxAbsValue;

  if (value > 0) {
    if (intensity >= 0.66) return "bg-green-200 text-green-950";
    if (intensity >= 0.33) return "bg-green-100 text-green-900";
    return "bg-green-50 text-green-800";
  }

  if (intensity >= 0.66) return "bg-red-200 text-red-950";
  if (intensity >= 0.33) return "bg-red-100 text-red-900";
  return "bg-red-50 text-red-800";
}

function addToSummary(
  map: Map<string, GeoSummary>,
  key: string,
  row: {
    shipmentCount: number;
    historicalSpend: number;
    awardedCost: number | null;
    savings: number | null;
  }
) {
  const cleanKey = key || "Unknown";

  const existing =
    map.get(cleanKey) ??
    {
      key: cleanKey,
      laneCount: 0,
      awardedLaneCount: 0,
      shipmentCount: 0,
      historicalSpend: 0,
      awardedCost: 0,
      savings: 0,
    };

  existing.laneCount += 1;
  existing.shipmentCount += row.shipmentCount;
  existing.historicalSpend += row.historicalSpend;

  if (row.awardedCost !== null) {
    existing.awardedLaneCount += 1;
    existing.awardedCost += row.awardedCost;
    existing.savings += row.savings ?? 0;
  }

  map.set(cleanKey, existing);
}

function SummaryTable({
  title,
  description,
  rows,
  maxAbsSavings,
}: {
  title: string;
  description: string;
  rows: GeoSummary[];
  maxAbsSavings: number;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Lanes</th>
              <th className="px-4 py-3">Awarded</th>
              <th className="px-4 py-3">Coverage</th>
              <th className="px-4 py-3">Shipments</th>
              <th className="px-4 py-3">Historical Spend</th>
              <th className="px-4 py-3">Awarded Spend</th>
              <th className="px-4 py-3">Savings</th>
              <th className="px-4 py-3">Savings %</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => {
              const awardCoverage =
                row.laneCount > 0 ? row.awardedLaneCount / row.laneCount : 0;

              const savingsPercent =
                row.historicalSpend > 0 ? row.savings / row.historicalSpend : 0;

              return (
                <tr key={row.key}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {row.key}
                  </td>

                  <td className="px-4 py-3 text-slate-600">{row.laneCount}</td>

                  <td className="px-4 py-3 text-slate-600">
                    {row.awardedLaneCount}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {percent(awardCoverage)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {row.shipmentCount.toLocaleString("en-US")}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {money(row.historicalSpend)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {money(row.awardedCost)}
                  </td>

                  <td className="px-4 py-3">
                    <span className={`rounded-lg px-2 py-1 font-semibold ${heatClass(row.savings, maxAbsSavings)}`}>
                      {money(row.savings)}
                    </span>
                  </td>

                  <td className={`px-4 py-3 font-semibold ${savingsClass(savingsPercent)}`}>
                    {percent(savingsPercent)}
                  </td>
                </tr>
              );
            })}

            {!rows.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={9}>
                  No geography analytics are available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function RfpGeographyAnalyticsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, lanesResult, awardsResult] = await Promise.all([
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
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);

  const rfp = rfpResult.data;
  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => {
    awardsByLane.set(String(award.lane_id), award);
  });

  const originStateMap = new Map<string, GeoSummary>();
  const destinationStateMap = new Map<string, GeoSummary>();
  const statePairMap = new Map<string, GeoSummary>();
  const originZip3Map = new Map<string, GeoSummary>();
  const destinationZip3Map = new Map<string, GeoSummary>();

  lanes.forEach((lane) => {
    const award = awardsByLane.get(String(lane.id)) ?? null;

    const shipmentCount = numberValue(lane, ["shipment_count", "shipments", "count"], 0);
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

    const summaryRow = {
      shipmentCount,
      historicalSpend,
      awardedCost,
      savings,
    };

    const originState = String(lane.origin_state ?? "").trim() || "Unknown";
    const destinationState = String(lane.destination_state ?? "").trim() || "Unknown";
    const statePair = String(lane.lane_state_pair ?? `${originState}${destinationState}`).trim() || "Unknown";

    const originZip = String(lane.origin_zip ?? "").trim();
    const destinationZip = String(lane.destination_zip ?? "").trim();

    addToSummary(originStateMap, originState, summaryRow);
    addToSummary(destinationStateMap, destinationState, summaryRow);
    addToSummary(statePairMap, statePair, summaryRow);
    addToSummary(originZip3Map, originZip.length >= 3 ? originZip.slice(0, 3) : "Unknown", summaryRow);
    addToSummary(destinationZip3Map, destinationZip.length >= 3 ? destinationZip.slice(0, 3) : "Unknown", summaryRow);
  });

  const originStateRows = Array.from(originStateMap.values()).sort(
    (a, b) => Math.abs(b.savings) - Math.abs(a.savings)
  );

  const destinationStateRows = Array.from(destinationStateMap.values()).sort(
    (a, b) => Math.abs(b.savings) - Math.abs(a.savings)
  );

  const statePairRows = Array.from(statePairMap.values()).sort(
    (a, b) => Math.abs(b.savings) - Math.abs(a.savings)
  );

  const originZip3Rows = Array.from(originZip3Map.values()).sort(
    (a, b) => Math.abs(b.savings) - Math.abs(a.savings)
  );

  const destinationZip3Rows = Array.from(destinationZip3Map.values()).sort(
    (a, b) => Math.abs(b.savings) - Math.abs(a.savings)
  );

  const maxAbsSavings = Math.max(
    1,
    ...[
      ...originStateRows,
      ...destinationStateRows,
      ...statePairRows,
      ...originZip3Rows,
      ...destinationZip3Rows,
    ].map((row) => Math.abs(row.savings))
  );

  return (
    <div>
      <SectionHeader
        title="Geography Analytics"
        description={`${rfp.name} - origin, destination, state-pair, and ZIP3 performance`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}/analytics`}
              className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
            >
              Analytics
            </Link>

            <Link
              href={`/rfps/${rfp.id}/analytics/coverage`}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Coverage
            </Link>

            <Link
              href={`/rfps/${rfp.id}/analytics/risk`}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Risk
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

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        This page is the start of Power BI-style geography drilldown. State and ZIP3 views help identify where savings, cost increases, and incomplete award coverage are concentrated.
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <MoneyBarChart
          title="Top State-Pair Savings Impact"
          description="Largest positive or negative savings impact by origin-destination state pair."
          data={statePairRows.slice(0, 12).map((row) => ({
            label: row.key,
            value: row.savings,
            detail: `${row.awardedLaneCount}/${row.laneCount} lane(s) awarded`,
          }))}
        />

        <MoneyBarChart
          title="Origin State Savings Impact"
          description="Savings impact grouped by origin state."
          data={originStateRows.slice(0, 12).map((row) => ({
            label: row.key,
            value: row.savings,
            detail: `${row.shipmentCount.toLocaleString("en-US")} shipment(s)`,
          }))}
        />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <CountBarChart
          title="Lane Count by Origin State"
          description="Where the RFP lane volume originates."
          data={originStateRows.slice(0, 12).map((row) => ({
            label: row.key,
            value: row.laneCount,
            detail: `${row.awardedLaneCount} awarded lane(s)`,
          }))}
        />

        <CountBarChart
          title="Lane Count by Destination State"
          description="Where the RFP lane volume delivers."
          data={destinationStateRows.slice(0, 12).map((row) => ({
            label: row.key,
            value: row.laneCount,
            detail: `${row.awardedLaneCount} awarded lane(s)`,
          }))}
        />
      </div>
      <div className="space-y-6">
        <SummaryTable
          title="State-Pair Heat Map"
          description="Savings impact by origin-destination state pair."
          rows={statePairRows.slice(0, 75)}
          maxAbsSavings={maxAbsSavings}
        />

        <SummaryTable
          title="Origin State Analytics"
          description="Spend and savings grouped by origin state."
          rows={originStateRows}
          maxAbsSavings={maxAbsSavings}
        />

        <SummaryTable
          title="Destination State Analytics"
          description="Spend and savings grouped by destination state."
          rows={destinationStateRows}
          maxAbsSavings={maxAbsSavings}
        />

        <SummaryTable
          title="Origin ZIP3 Analytics"
          description="Spend and savings grouped by the first three digits of origin ZIP."
          rows={originZip3Rows.slice(0, 75)}
          maxAbsSavings={maxAbsSavings}
        />

        <SummaryTable
          title="Destination ZIP3 Analytics"
          description="Spend and savings grouped by the first three digits of destination ZIP."
          rows={destinationZip3Rows.slice(0, 75)}
          maxAbsSavings={maxAbsSavings}
        />
      </div>
    </div>
  );
}