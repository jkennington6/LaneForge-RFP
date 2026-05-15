import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type LaneImpact = {
  laneId: string;
  laneName: string;
  carrierName: string;
  historicalSpend: number;
  awardedCost: number;
  savings: number;
};

type StatePairImpact = {
  laneStatePair: string;
  historicalSpend: number;
  awardedCost: number;
  savings: number;
  laneCount: number;
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

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-US", {
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

function laneName(lane: AnyRow) {
  return `${lane.lane_state_pair ?? "Lane"} - ${lane.origin_zip ?? "-"} to ${lane.destination_zip ?? "-"}`;
}

function barWidth(value: number, maxValue: number) {
  if (maxValue <= 0) return 0;
  return Math.max(4, Math.round((Math.abs(value) / maxValue) * 100));
}

export default async function SavingsBridgeAnalyticsPage({
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

  if (rfpResult.error || !rfpResult.data) notFound();
  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);

  const rfp = rfpResult.data;
  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => awardsByLane.set(String(award.lane_id), award));

  const laneImpacts: LaneImpact[] = [];
  const statePairMap = new Map<string, StatePairImpact>();

  lanes.forEach((lane) => {
    const award = awardsByLane.get(String(lane.id));
    const carrierName = String(award?.primary_carrier_name ?? "").trim();

    const historicalSpend = numberValue(lane, [
      "historical_spend",
      "current_spend",
      "current_total",
      "total_spend",
      "spend",
    ]);

    if (!carrierName) return;

    const awardedCost =
      award?.primary_estimated_cost !== null &&
      award?.primary_estimated_cost !== undefined
        ? Number(award.primary_estimated_cost)
        : 0;

    const savings = historicalSpend - awardedCost;

    laneImpacts.push({
      laneId: String(lane.id),
      laneName: laneName(lane),
      carrierName,
      historicalSpend,
      awardedCost,
      savings,
    });

    const statePair = String(lane.lane_state_pair ?? "Unknown");

    const existing =
      statePairMap.get(statePair) ??
      {
        laneStatePair: statePair,
        historicalSpend: 0,
        awardedCost: 0,
        savings: 0,
        laneCount: 0,
      };

    existing.historicalSpend += historicalSpend;
    existing.awardedCost += awardedCost;
    existing.savings += savings;
    existing.laneCount += 1;

    statePairMap.set(statePair, existing);
  });

  const totalHistoricalSpend = laneImpacts.reduce((sum, row) => sum + row.historicalSpend, 0);
  const totalAwardedCost = laneImpacts.reduce((sum, row) => sum + row.awardedCost, 0);
  const grossSavings = laneImpacts.filter((row) => row.savings > 0).reduce((sum, row) => sum + row.savings, 0);
  const grossIncreases = laneImpacts.filter((row) => row.savings < 0).reduce((sum, row) => sum + Math.abs(row.savings), 0);
  const netSavings = totalHistoricalSpend - totalAwardedCost;
  const savingsPercent = totalHistoricalSpend > 0 ? netSavings / totalHistoricalSpend : 0;

  const bridgeRows = [
    { label: "Historical Baseline", value: totalHistoricalSpend, detail: "Current or historical spend baseline" },
    { label: "Gross Savings", value: grossSavings, detail: "Positive lane savings before offsets" },
    { label: "Gross Cost Increases", value: -grossIncreases, detail: "Lanes where award is above baseline" },
    { label: "Net Savings", value: netSavings, detail: `${percent(savingsPercent)} total savings impact` },
    { label: "Awarded Spend", value: totalAwardedCost, detail: "Estimated spend after awards" },
  ];

  const maxBridgeValue = Math.max(1, ...bridgeRows.map((row) => Math.abs(row.value)));

  const topSavings = laneImpacts
    .filter((row) => row.savings > 0)
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 25);

  const topIncreases = laneImpacts
    .filter((row) => row.savings < 0)
    .sort((a, b) => a.savings - b.savings)
    .slice(0, 25);

  const statePairImpacts = Array.from(statePairMap.values()).sort(
    (a, b) => Math.abs(b.savings) - Math.abs(a.savings)
  );

  return (
    <div>
      <SectionHeader
        title="Savings Bridge Analytics"
        description={`${rfp.name} - baseline to award spend bridge, offsets, and largest lane impacts`}
        action={
          <div className="flex flex-wrap gap-2">

            <Link
              href={`/rfps/${rfp.id}/analytics/savings/export`}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
            >
              Export Savings CSV
            </Link>

            <Link href={`/rfps/${rfp.id}/analytics`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Analytics
            </Link>
            <Link href={`/rfps/${rfp.id}/analytics/concentration`} className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100">
              Concentration
            </Link>
            <Link href={`/rfps/${rfp.id}/analytics/readiness`} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100">
              Readiness
            </Link>
            <Link href={`/rfps/${rfp.id}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Back to RFP
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Historical Baseline</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{money(totalHistoricalSpend)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awarded Spend</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{money(totalAwardedCost)}</p>
        </div>

        <div className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
          <p className="text-sm text-green-700">Gross Savings</p>
          <p className="mt-2 text-2xl font-bold text-green-950">{money(grossSavings)}</p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm text-red-700">Gross Cost Increases</p>
          <p className="mt-2 text-2xl font-bold text-red-950">{money(grossIncreases)}</p>
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Savings Bridge</h2>
        <p className="mt-1 text-sm text-slate-600">
          Shows how the baseline spend moves to the awarded spend after savings and cost increase offsets.
        </p>

        <div className="mt-5 space-y-4">
          {bridgeRows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-950">{row.label}</p>
                  <p className="text-xs text-slate-500">{row.detail}</p>
                </div>
                <p className={`font-semibold ${savingsClass(row.value)}`}>{money(row.value)}</p>
              </div>

              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className={row.value >= 0 ? "h-3 rounded-full bg-slate-900" : "h-3 rounded-full bg-red-700"}
                  style={{ width: `${barWidth(row.value, maxBridgeValue)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-green-200 bg-white shadow-sm">
          <div className="border-b border-green-200 bg-green-50 p-5">
            <h2 className="text-lg font-semibold text-green-950">Largest Savings Lanes</h2>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Lane</th>
                <th className="px-4 py-3">Carrier</th>
                <th className="px-4 py-3">Savings</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {topSavings.map((row) => (
                <tr key={row.laneId}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{row.laneName}</td>
                  <td className="px-4 py-3 text-slate-600">{row.carrierName}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{money(row.savings)}</td>
                </tr>
              ))}

              {!topSavings.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={3}>
                    No positive savings lanes are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
          <div className="border-b border-red-200 bg-red-50 p-5">
            <h2 className="text-lg font-semibold text-red-950">Largest Cost Increase Lanes</h2>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Lane</th>
                <th className="px-4 py-3">Carrier</th>
                <th className="px-4 py-3">Impact</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {topIncreases.map((row) => (
                <tr key={row.laneId}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{row.laneName}</td>
                  <td className="px-4 py-3 text-slate-600">{row.carrierName}</td>
                  <td className="px-4 py-3 font-semibold text-red-700">{money(row.savings)}</td>
                </tr>
              ))}

              {!topIncreases.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={3}>
                    No cost increase lanes are currently identified.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">State-Pair Savings Bridge</h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">State Pair</th>
              <th className="px-4 py-3">Lanes</th>
              <th className="px-4 py-3">Historical</th>
              <th className="px-4 py-3">Awarded</th>
              <th className="px-4 py-3">Savings</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {statePairImpacts.slice(0, 50).map((row) => (
              <tr key={row.laneStatePair}>
                <td className="px-4 py-3 font-semibold text-slate-950">{row.laneStatePair}</td>
                <td className="px-4 py-3 text-slate-600">{row.laneCount}</td>
                <td className="px-4 py-3 text-slate-600">{money(row.historicalSpend)}</td>
                <td className="px-4 py-3 text-slate-600">{money(row.awardedCost)}</td>
                <td className={`px-4 py-3 font-semibold ${savingsClass(row.savings)}`}>{money(row.savings)}</td>
              </tr>
            ))}

            {!statePairImpacts.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No awarded savings bridge data is available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}