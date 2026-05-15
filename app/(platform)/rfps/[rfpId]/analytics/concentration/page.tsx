import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type CarrierSummary = {
  carrierName: string;
  laneCount: number;
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

function barWidth(value: number, maxValue: number) {
  if (maxValue <= 0) return 0;
  return Math.max(4, Math.round((Math.abs(value) / maxValue) * 100));
}

function concentrationLabel(hhi: number) {
  if (hhi >= 2500) return "Highly concentrated";
  if (hhi >= 1500) return "Moderately concentrated";
  return "Diversified";
}

function concentrationClass(hhi: number) {
  if (hhi >= 2500) return "border-red-200 bg-red-50 text-red-800";
  if (hhi >= 1500) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-green-200 bg-green-50 text-green-800";
}

export default async function CarrierConcentrationAnalyticsPage({
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

  const carrierMap = new Map<string, CarrierSummary>();

  lanes.forEach((lane) => {
    const award = awardsByLane.get(String(lane.id));
    const carrierName = String(award?.primary_carrier_name ?? "").trim();

    if (!carrierName) return;

    const shipmentCount = numberValue(lane, ["shipment_count", "shipments", "count"]);
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
        : 0;

    const savings = historicalSpend - awardedCost;

    const existing =
      carrierMap.get(carrierName) ??
      {
        carrierName,
        laneCount: 0,
        shipmentCount: 0,
        historicalSpend: 0,
        awardedCost: 0,
        savings: 0,
      };

    existing.laneCount += 1;
    existing.shipmentCount += shipmentCount;
    existing.historicalSpend += historicalSpend;
    existing.awardedCost += awardedCost;
    existing.savings += savings;

    carrierMap.set(carrierName, existing);
  });

  const carrierSummary = Array.from(carrierMap.values()).sort(
    (a, b) => b.awardedCost - a.awardedCost
  );

  const totalAwardedSpend = carrierSummary.reduce((sum, row) => sum + row.awardedCost, 0);
  const totalAwardedLanes = carrierSummary.reduce((sum, row) => sum + row.laneCount, 0);
  const totalShipments = carrierSummary.reduce((sum, row) => sum + row.shipmentCount, 0);
  const totalSavings = carrierSummary.reduce((sum, row) => sum + row.savings, 0);

  const hhi =
    totalAwardedSpend > 0
      ? carrierSummary.reduce((sum, row) => {
          const share = row.awardedCost / totalAwardedSpend;
          return sum + share * share * 10000;
        }, 0)
      : 0;

  const topCarrier = carrierSummary[0] ?? null;
  const topCarrierSpendShare =
    topCarrier && totalAwardedSpend > 0 ? topCarrier.awardedCost / totalAwardedSpend : 0;

  const maxSpend = Math.max(1, ...carrierSummary.map((carrier) => carrier.awardedCost));

  return (
    <div>
      <SectionHeader
        title="Carrier Concentration Analytics"
        description={`${rfp.name} - award share, carrier dependency, and concentration risk`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/rfps/${rfp.id}/analytics`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Analytics
            </Link>
            <Link href={`/rfps/${rfp.id}/analytics/savings`} className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100">
              Savings Bridge
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
          <p className="text-sm text-slate-500">Concentration Score</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{Math.round(hhi).toLocaleString("en-US")}</p>
          <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${concentrationClass(hhi)}`}>
            {concentrationLabel(hhi)}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Top Carrier Share</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{percent(topCarrierSpendShare)}</p>
          <p className="mt-1 text-xs text-slate-500">{topCarrier?.carrierName ?? "No awards yet"}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awarded Spend</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{money(totalAwardedSpend)}</p>
          <p className="mt-1 text-xs text-slate-500">{totalAwardedLanes} awarded lane(s)</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Net Savings</p>
          <p className={`mt-2 text-2xl font-bold ${savingsClass(totalSavings)}`}>{money(totalSavings)}</p>
          <p className="mt-1 text-xs text-slate-500">{totalShipments.toLocaleString("en-US")} shipment(s)</p>
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Award Share by Carrier</h2>
        <p className="mt-1 text-sm text-slate-600">
          This view shows whether the award is balanced or overly dependent on one carrier.
        </p>

        <div className="mt-5 space-y-4">
          {carrierSummary.map((carrier) => {
            const spendShare = totalAwardedSpend > 0 ? carrier.awardedCost / totalAwardedSpend : 0;

            return (
              <div key={carrier.carrierName}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-semibold text-slate-950">{carrier.carrierName}</p>
                    <p className="text-xs text-slate-500">
                      {carrier.laneCount} lane(s) - {percent(spendShare)} of awarded spend
                    </p>
                  </div>
                  <p className="font-semibold text-slate-950">{money(carrier.awardedCost)}</p>
                </div>

                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-slate-900"
                    style={{ width: `${barWidth(carrier.awardedCost, maxSpend)}%` }}
                  />
                </div>
              </div>
            );
          })}

          {!carrierSummary.length && (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              No awarded carrier data is available yet.
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Carrier Concentration Table</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Carrier</th>
                <th className="px-4 py-3">Lanes</th>
                <th className="px-4 py-3">Lane Share</th>
                <th className="px-4 py-3">Shipments</th>
                <th className="px-4 py-3">Shipment Share</th>
                <th className="px-4 py-3">Awarded Spend</th>
                <th className="px-4 py-3">Spend Share</th>
                <th className="px-4 py-3">Savings</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {carrierSummary.map((carrier) => (
                <tr key={carrier.carrierName}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{carrier.carrierName}</td>
                  <td className="px-4 py-3 text-slate-600">{carrier.laneCount}</td>
                  <td className="px-4 py-3 text-slate-600">{percent(totalAwardedLanes > 0 ? carrier.laneCount / totalAwardedLanes : 0)}</td>
                  <td className="px-4 py-3 text-slate-600">{carrier.shipmentCount.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 text-slate-600">{percent(totalShipments > 0 ? carrier.shipmentCount / totalShipments : 0)}</td>
                  <td className="px-4 py-3 text-slate-600">{money(carrier.awardedCost)}</td>
                  <td className="px-4 py-3 text-slate-600">{percent(totalAwardedSpend > 0 ? carrier.awardedCost / totalAwardedSpend : 0)}</td>
                  <td className={`px-4 py-3 font-semibold ${savingsClass(carrier.savings)}`}>{money(carrier.savings)}</td>
                </tr>
              ))}

              {!carrierSummary.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={8}>
                    No awarded carrier data is available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}