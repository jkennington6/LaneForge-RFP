import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { AnalyticsDonut, CountBarChart, MoneyBarChart } from "@/components/analytics-charts";
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

type StatePairSummary = {
  laneStatePair: string;
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

function laneName(lane: AnyRow) {
  const statePair = lane.lane_state_pair ?? "Lane";
  const originZip = lane.origin_zip ?? "-";
  const destinationZip = lane.destination_zip ?? "-";

  return `${statePair} - ${originZip} to ${destinationZip}`;
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

export default async function RfpAnalyticsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [
    rfpResult,
    lanesResult,
    awardsResult,
    invitesResult,
    submissionsResult,
    validationErrorsResult,
  ] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, mode, status, bid_due_date")
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

    supabase
      .from("rfp_carrier_invites")
      .select("id, carrier_name, status")
      .eq("rfp_id", rfpId),

    supabase
      .from("carrier_bid_submissions")
      .select("id, carrier_name, status, is_active")
      .eq("rfp_id", rfpId),

    supabase
      .from("carrier_bid_validation_errors")
      .select("id, error_type")
      .eq("rfp_id", rfpId),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);
  if (invitesResult.error) throw new Error(invitesResult.error.message);
  if (submissionsResult.error) throw new Error(submissionsResult.error.message);
  if (validationErrorsResult.error) throw new Error(validationErrorsResult.error.message);

  const rfp = rfpResult.data;
  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];
  const invites = (invitesResult.data ?? []) as AnyRow[];
  const submissions = (submissionsResult.data ?? []) as AnyRow[];
  const validationErrors = (validationErrorsResult.data ?? []) as AnyRow[];

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => {
    awardsByLane.set(String(award.lane_id), award);
  });

  const activeSubmissions = submissions.filter((submission) => submission.is_active);

  const laneAnalyticsRows = lanes.map((lane) => {
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

    return {
      lane,
      award,
      shipmentCount,
      historicalSpend,
      awardedCost,
      savings,
      savingsPercent:
        savings !== null && historicalSpend > 0 ? savings / historicalSpend : null,
    };
  });

  const awardedRows = laneAnalyticsRows.filter(
    (row) => row.award?.primary_carrier_name && row.awardedCost !== null
  );

  const totalLanes = lanes.length;
  const awardedLaneCount = awardedRows.length;
  const unawardedLaneCount = Math.max(0, totalLanes - awardedLaneCount);

  const totalHistoricalSpend = laneAnalyticsRows.reduce(
    (sum, row) => sum + row.historicalSpend,
    0
  );

  const totalAwardedCost = awardedRows.reduce(
    (sum, row) => sum + Number(row.awardedCost ?? 0),
    0
  );

  const totalSavings = totalHistoricalSpend - totalAwardedCost;
  const totalSavingsPercent =
    totalHistoricalSpend > 0 ? totalSavings / totalHistoricalSpend : 0;

  const totalShipments = laneAnalyticsRows.reduce(
    (sum, row) => sum + row.shipmentCount,
    0
  );

  const carrierSummaryMap = new Map<string, CarrierSummary>();

  awardedRows.forEach((row) => {
    const carrierName = String(row.award?.primary_carrier_name ?? "Unassigned");

    const existing =
      carrierSummaryMap.get(carrierName) ??
      {
        carrierName,
        laneCount: 0,
        shipmentCount: 0,
        historicalSpend: 0,
        awardedCost: 0,
        savings: 0,
      };

    existing.laneCount += 1;
    existing.shipmentCount += row.shipmentCount;
    existing.historicalSpend += row.historicalSpend;
    existing.awardedCost += Number(row.awardedCost ?? 0);
    existing.savings += Number(row.savings ?? 0);

    carrierSummaryMap.set(carrierName, existing);
  });

  const carrierSummary = Array.from(carrierSummaryMap.values()).sort(
    (a, b) => b.awardedCost - a.awardedCost
  );

  const maxCarrierAwardedCost = Math.max(
    1,
    ...carrierSummary.map((carrier) => carrier.awardedCost)
  );

  const statePairSummaryMap = new Map<string, StatePairSummary>();

  laneAnalyticsRows.forEach((row) => {
    const laneStatePair = String(row.lane.lane_state_pair ?? "Unknown");

    const existing =
      statePairSummaryMap.get(laneStatePair) ??
      {
        laneStatePair,
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
      existing.awardedCost += Number(row.awardedCost ?? 0);
      existing.savings += Number(row.savings ?? 0);
    }

    statePairSummaryMap.set(laneStatePair, existing);
  });

  const statePairSummary = Array.from(statePairSummaryMap.values()).sort(
    (a, b) => Math.abs(b.savings) - Math.abs(a.savings)
  );

  const maxAbsStatePairSavings = Math.max(
    1,
    ...statePairSummary.map((row) => Math.abs(row.savings))
  );

  const topSavingsLanes = awardedRows
    .filter((row) => row.savings !== null)
    .sort((a, b) => Number(b.savings ?? 0) - Number(a.savings ?? 0))
    .slice(0, 15);

  const negativeImpactLanes = awardedRows
    .filter((row) => Number(row.savings ?? 0) < 0)
    .sort((a, b) => Number(a.savings ?? 0) - Number(b.savings ?? 0))
    .slice(0, 15);

  const singleCarrierRiskCount = statePairSummary.filter(
    (row) => row.awardedLaneCount > 0 && row.awardedLaneCount < row.laneCount
  ).length;

  return (
    <div>
      <SectionHeader
        title="RFP Analytics"
        description={`${rfp.name} - spend, savings, carrier award share, and lane-level opportunity`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}/analytics/executive`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Executive Report
            </Link>

            <Link
              href={`/rfps/${rfp.id}/analytics/export`}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
            >
              Analytics CSV
            </Link>

            <Link
              href={`/rfps/${rfp.id}/analytics/geography`}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Geography
            </Link>

            <Link
              href={`/rfps/${rfp.id}/analytics/coverage`}
              className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-100"
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
              href={`/rfps/${rfp.id}/awards`}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Awards
            </Link>

            <Link
              href={`/rfps/${rfp.id}/awards/summary`}
              className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
            >
              Award Summary
            </Link>

            <Link
              href={`/rfps/${rfp.id}/readiness`}
              className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
            >
              Readiness
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

      <div className="mb-6 grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Historical Spend</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {money(totalHistoricalSpend)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awarded Spend</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {money(totalAwardedCost)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Estimated Savings</p>
          <p className={`mt-2 text-xl font-bold ${savingsClass(totalSavings)}`}>
            {money(totalSavings)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {percent(totalSavingsPercent)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Award Coverage</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {awardedLaneCount}/{totalLanes}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {percent(totalLanes > 0 ? awardedLaneCount / totalLanes : 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Shipments</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {totalShipments.toLocaleString("en-US")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Invited Carriers</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {invites.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active Bids</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {activeSubmissions.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Validation Errors</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {validationErrors.length}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <AnalyticsDonut
          title="Award Coverage"
          description="Formal award completion across all RFP lanes."
          primaryLabel="Awarded lanes"
          primaryValue={awardedLaneCount}
          secondaryLabel="Unawarded lanes"
          secondaryValue={unawardedLaneCount}
        />

        <MoneyBarChart
          title="Awarded Spend by Carrier"
          description="Largest awarded carrier positions by estimated awarded spend."
          data={carrierSummary.map((carrier) => ({
            label: carrier.carrierName,
            value: carrier.awardedCost,
            detail: `${carrier.laneCount} lane(s) - ${percent(totalAwardedCost > 0 ? carrier.awardedCost / totalAwardedCost : 0)} of awarded spend`,
          }))}
        />

        <MoneyBarChart
          title="Savings by State Pair"
          description="Highest positive or negative savings impact by state pair."
          data={statePairSummary.slice(0, 12).map((row) => ({
            label: row.laneStatePair,
            value: row.savings,
            detail: `${row.awardedLaneCount}/${row.laneCount} lane(s) awarded`,
          }))}
        />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <CountBarChart
          title="Lane Awards by Carrier"
          description="Primary award lane count by carrier."
          data={carrierSummary.map((carrier) => ({
            label: carrier.carrierName,
            value: carrier.laneCount,
            detail: `${carrier.shipmentCount.toLocaleString("en-US")} shipment(s) represented`,
          }))}
        />

        <CountBarChart
          title="Shipments by Awarded Carrier"
          description="Shipment volume represented by each awarded carrier."
          data={carrierSummary.map((carrier) => ({
            label: carrier.carrierName,
            value: carrier.shipmentCount,
            detail: `${money(carrier.awardedCost)} awarded spend`,
          }))}
        />
      </div>
      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        This dashboard is the start of LaneForge replacing separate Power BI workbooks for RFP review.
        It ties formal awards directly to spend, savings, carrier share, and geography.
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Carrier Award Share
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Primary award share by carrier based on formal award decisions.
          </p>
        </div>

        <div className="divide-y divide-slate-200">
          {carrierSummary.map((carrier) => {
            const awardedCostShare =
              totalAwardedCost > 0 ? carrier.awardedCost / totalAwardedCost : 0;

            const laneShare =
              awardedLaneCount > 0 ? carrier.laneCount / awardedLaneCount : 0;

            const barWidth = Math.max(
              4,
              Math.round((carrier.awardedCost / maxCarrierAwardedCost) * 100)
            );

            return (
              <div key={carrier.carrierName} className="p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {carrier.carrierName}
                    </p>
                    <p className="text-sm text-slate-600">
                      {carrier.laneCount} lane(s) - {carrier.shipmentCount.toLocaleString("en-US")} shipment(s)
                    </p>
                  </div>

                  <div className="text-right text-sm">
                    <p className="font-semibold text-slate-950">
                      {money(carrier.awardedCost)}
                    </p>
                    <p className="text-slate-500">
                      {percent(awardedCostShare)} of awarded spend
                    </p>
                  </div>
                </div>

                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-slate-900"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                  <span>Lane share: {percent(laneShare)}</span>
                  <span>Historical: {money(carrier.historicalSpend)}</span>
                  <span>Awarded: {money(carrier.awardedCost)}</span>
                  <span className={savingsClass(carrier.savings)}>
                    Savings: {money(carrier.savings)}
                  </span>
                </div>
              </div>
            );
          })}

          {!carrierSummary.length && (
            <div className="p-6 text-sm text-slate-600">
              No carrier award analytics are available yet. Generate or save formal awards first.
            </div>
          )}
        </div>
      </section>

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            State-Pair Savings Heat Map
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Darker green indicates higher estimated savings. Red indicates negative impact.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">State Pair</th>
                <th className="px-4 py-3">Lanes</th>
                <th className="px-4 py-3">Awarded</th>
                <th className="px-4 py-3">Shipments</th>
                <th className="px-4 py-3">Historical Spend</th>
                <th className="px-4 py-3">Awarded Spend</th>
                <th className="px-4 py-3">Savings</th>
                <th className="px-4 py-3">Savings %</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {statePairSummary.slice(0, 40).map((row) => {
                const savingsPercent =
                  row.historicalSpend > 0 ? row.savings / row.historicalSpend : 0;

                return (
                  <tr key={row.laneStatePair}>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {row.laneStatePair}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {row.laneCount}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {row.awardedLaneCount}
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
                      <span className={`rounded-lg px-2 py-1 font-semibold ${heatClass(row.savings, maxAbsStatePairSavings)}`}>
                        {money(row.savings)}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {percent(savingsPercent)}
                    </td>
                  </tr>
                );
              })}

              {!statePairSummary.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={8}>
                    No state-pair analytics are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {statePairSummary.length > 40 && (
          <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            Showing top 40 state pairs by savings impact.
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-950">
              Top Savings Lanes
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Best estimated savings opportunities based on formal awards.
            </p>
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
              {topSavingsLanes.map((row, index) => (
                <tr key={`${String(row.lane.id)}-${index}`}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {laneName(row.lane)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {row.award?.primary_carrier_name ?? "-"}
                  </td>

                  <td className="px-4 py-3 font-semibold text-green-700">
                    {money(row.savings)}
                  </td>
                </tr>
              ))}

              {!topSavingsLanes.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={3}>
                    No savings lanes are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-950">
              Negative Impact / Review Lanes
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Lanes where the award appears higher than historical spend.
            </p>
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
              {negativeImpactLanes.map((row, index) => (
                <tr key={`${String(row.lane.id)}-${index}`}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {laneName(row.lane)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {row.award?.primary_carrier_name ?? "-"}
                  </td>

                  <td className="px-4 py-3 font-semibold text-red-700">
                    {money(row.savings)}
                  </td>
                </tr>
              ))}

              {!negativeImpactLanes.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={3}>
                    No negative-impact lanes are currently identified.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Analytics note: {unawardedLaneCount} lane(s) are still unawarded. 
        {singleCarrierRiskCount > 0
          ? ` ${singleCarrierRiskCount} state-pair group(s) have incomplete award coverage and should be reviewed.`
          : " Award coverage by state pair looks complete based on current data."}
      </div>
    </div>
  );
}