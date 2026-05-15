import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

function moneyNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  const parsed = moneyNumber(value);

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

function laneLabel(lane: AnyRow) {
  const statePair = lane.lane_state_pair ?? "Lane";
  const origin = lane.origin_zip ?? "-";
  const destination = lane.destination_zip ?? "-";

  return `${statePair} - ${origin} to ${destination}`;
}

export default async function AwardSummaryPage({
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
      .eq("rfp_id", rfpId)
      .order("lane_state_pair", { ascending: true }),

    supabase
      .from("rfp_lane_awards")
      .select("*")
      .eq("rfp_id", rfpId),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (lanesResult.error) {
    throw new Error(lanesResult.error.message);
  }

  if (awardsResult.error) {
    throw new Error(awardsResult.error.message);
  }

  const rfp = rfpResult.data;
  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];

  const lanesById = new Map<string, AnyRow>();
  lanes.forEach((lane) => lanesById.set(String(lane.id), lane));

  const awardedRows = awards
    .filter((award) => award.primary_carrier_name)
    .map((award) => {
      const lane = lanesById.get(String(award.lane_id)) ?? {};
      const historicalSpend = moneyNumber(lane.historical_spend);
      const awardedCost = moneyNumber(award.primary_estimated_cost);
      const estimatedSavings =
        award.primary_estimated_cost !== null &&
        award.primary_estimated_cost !== undefined
          ? historicalSpend - awardedCost
          : 0;

      return {
        award,
        lane,
        carrierName: String(award.primary_carrier_name ?? "Unassigned"),
        shipmentCount: moneyNumber(lane.shipment_count),
        historicalSpend,
        awardedCost,
        estimatedSavings,
      };
    });

  const summaryByCarrier = new Map<
    string,
    {
      carrierName: string;
      laneCount: number;
      shipmentCount: number;
      historicalSpend: number;
      awardedCost: number;
      estimatedSavings: number;
    }
  >();

  awardedRows.forEach((row) => {
    const existing =
      summaryByCarrier.get(row.carrierName) ??
      {
        carrierName: row.carrierName,
        laneCount: 0,
        shipmentCount: 0,
        historicalSpend: 0,
        awardedCost: 0,
        estimatedSavings: 0,
      };

    existing.laneCount += 1;
    existing.shipmentCount += row.shipmentCount;
    existing.historicalSpend += row.historicalSpend;
    existing.awardedCost += row.awardedCost;
    existing.estimatedSavings += row.estimatedSavings;

    summaryByCarrier.set(row.carrierName, existing);
  });

  const carrierSummary = Array.from(summaryByCarrier.values()).sort(
    (a, b) => b.awardedCost - a.awardedCost
  );

  const totalHistoricalSpend = awardedRows.reduce(
    (sum, row) => sum + row.historicalSpend,
    0
  );

  const totalAwardedCost = awardedRows.reduce(
    (sum, row) => sum + row.awardedCost,
    0
  );

  const totalEstimatedSavings = totalHistoricalSpend - totalAwardedCost;
  const totalAwardedLanes = awardedRows.length;
  const unawardedLanes = Math.max(0, lanes.length - totalAwardedLanes);
  const savingsPercent =
    totalHistoricalSpend > 0 ? totalEstimatedSavings / totalHistoricalSpend : 0;

  return (
    <div>
      <SectionHeader
        title="Award Summary"
        description={`${rfp.name} - carrier award share, spend, and savings summary`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}/awards`}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Award Decisions
            </Link>

            <Link
              href={`/rfps/${rfp.id}/awards/export`}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
            >
              Download Awards CSV
            </Link>

            <Link
              href={`/rfps/${rfp.id}/awards/summary/export`}
              className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
            >
              Download Summary CSV
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awarded Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {totalAwardedLanes}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Unawarded Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {unawardedLanes}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Historical Spend</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {money(totalHistoricalSpend)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awarded Cost</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {money(totalAwardedCost)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Estimated Savings</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {money(totalEstimatedSavings)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {percent(savingsPercent)}
          </p>
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Carrier Award Summary
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Award share by primary carrier.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Lanes</th>
              <th className="px-4 py-3">Lane Share</th>
              <th className="px-4 py-3">Shipments</th>
              <th className="px-4 py-3">Historical Spend</th>
              <th className="px-4 py-3">Awarded Cost</th>
              <th className="px-4 py-3">Savings</th>
              <th className="px-4 py-3">Savings %</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {carrierSummary.map((carrier) => {
              const carrierSavingsPercent =
                carrier.historicalSpend > 0
                  ? carrier.estimatedSavings / carrier.historicalSpend
                  : 0;

              const laneShare =
                totalAwardedLanes > 0
                  ? carrier.laneCount / totalAwardedLanes
                  : 0;

              return (
                <tr key={carrier.carrierName}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {carrier.carrierName}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {carrier.laneCount}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {percent(laneShare)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {carrier.shipmentCount.toLocaleString("en-US")}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {money(carrier.historicalSpend)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {money(carrier.awardedCost)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {money(carrier.estimatedSavings)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {percent(carrierSavingsPercent)}
                  </td>
                </tr>
              );
            })}

            {!carrierSummary.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={8}>
                  No formal award decisions are available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Awarded Lane Detail
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Lane-level proof behind the summary.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Primary Carrier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Historical Spend</th>
              <th className="px-4 py-3">Awarded Cost</th>
              <th className="px-4 py-3">Savings</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {awardedRows.map((row) => (
              <tr key={row.award.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {laneLabel(row.lane)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {row.carrierName}
                </td>

                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {row.award.award_status ?? "draft"}
                  </span>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(row.historicalSpend)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(row.awardedCost)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(row.estimatedSavings)}
                </td>
              </tr>
            ))}

            {!awardedRows.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={6}>
                  No awarded lanes are available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}