import Link from "next/link";
import { notFound } from "next/navigation";
import {
  requireCustomerPortalUser,
  getCustomerOrgIdsForCurrentUser,
} from "@/lib/portal-access";
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

function rowBelongsToAnyOrg(row: AnyRow, orgIds: string[]) {
  if (!orgIds.length) return false;
  return Object.values(row).some((value) => orgIds.includes(String(value)));
}

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

function displayCarrierName(value: unknown, showCarrierNames: boolean) {
  if (!value) return "Unassigned";
  return showCarrierNames ? String(value) : "Released carriers";
}

export default async function CustomerRfpAnalyticsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;

  const user = await requireCustomerPortalUser();
  const customerOrgIds = (await getCustomerOrgIdsForCurrentUser(user)) ?? [];

  if (!customerOrgIds.length) {
    return new Response("Customer organization not linked.", { status: 403 });
  }

  const supabase = createServiceSupabaseClient();

  const [rfpResult, releaseResult, lanesResult, awardsResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("*")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .maybeSingle(),

    supabase
      .from("rfp_customer_release_settings")
      .select("*")
      .eq("rfp_id", rfpId)
      .maybeSingle(),

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

  const rfp = rfpResult.data as AnyRow;

  if (!rowBelongsToAnyOrg(rfp, customerOrgIds)) {
    notFound();
  }

  if (releaseResult.error) throw new Error(releaseResult.error.message);
  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);

  const release = releaseResult.data as AnyRow | null;

  const analyticsReleased = Boolean(
    release?.show_award_recommendation ||
      release?.show_comparisons ||
      release?.show_bid_amounts ||
      release?.show_savings
  );

  if (!analyticsReleased) {
    return new Response("Customer analytics have not been released.", { status: 403 });
  }

  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => awardsByLane.set(String(award.lane_id), award));

  const laneRows = lanes.map((lane) => {
    const award = awardsByLane.get(String(lane.id)) ?? null;

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
        : null;

    const savings = awardedCost !== null ? historicalSpend - awardedCost : null;

    return {
      lane,
      award,
      shipmentCount,
      historicalSpend,
      awardedCost,
      savings,
    };
  });

  const awardedRows = laneRows.filter(
    (row) => row.award?.primary_carrier_name && row.awardedCost !== null
  );

  const totalHistoricalSpend = laneRows.reduce((sum, row) => sum + row.historicalSpend, 0);
  const totalAwardedCost = awardedRows.reduce((sum, row) => sum + Number(row.awardedCost ?? 0), 0);
  const totalSavings = totalHistoricalSpend - totalAwardedCost;
  const totalSavingsPercent = totalHistoricalSpend > 0 ? totalSavings / totalHistoricalSpend : 0;

  const carrierSummaryMap = new Map<string, CarrierSummary>();

  awardedRows.forEach((row) => {
    const carrierName = displayCarrierName(
      row.award?.primary_carrier_name,
      Boolean(release?.show_carrier_names)
    );

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

  laneRows.forEach((row) => {
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/customer/rfps/${rfpId}`}
            className="text-sm font-semibold text-slate-600 hover:text-slate-950"
          >
            Back to RFP
          </Link>

          <h1 className="mt-4 text-2xl font-bold text-slate-950">
            RFP Analytics
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            {rfp.name} - released award and savings analytics
          </p>
        </div>

        <Link
          href={`/customer/rfps/${rfpId}/analytics/export`}
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
        >
          Download Analytics CSV
        </Link>
      </div>

      {release?.release_notes && (
        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
          <p className="font-semibold text-blue-950">Release Notes</p>
          <p className="mt-2 whitespace-pre-line">{release.release_notes}</p>
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awarded Lanes</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {awardedRows.length}/{lanes.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {percent(lanes.length > 0 ? awardedRows.length / lanes.length : 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awarded Spend</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {release?.show_bid_amounts ? money(totalAwardedCost) : "Hidden"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Historical Spend</p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            {release?.show_savings ? money(totalHistoricalSpend) : "Hidden"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Estimated Savings</p>
          <p className={`mt-2 text-xl font-bold ${savingsClass(totalSavings)}`}>
            {release?.show_savings ? money(totalSavings) : "Hidden"}
          </p>
          {release?.show_savings && (
            <p className="mt-1 text-xs text-slate-500">
              {percent(totalSavingsPercent)}
            </p>
          )}
        </div>
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Carrier Award Share
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Released primary award share by carrier.
          </p>
        </div>

        <div className="divide-y divide-slate-200">
          {carrierSummary.map((carrier) => {
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
                      {release?.show_bid_amounts ? money(carrier.awardedCost) : "Hidden"}
                    </p>
                    {release?.show_savings && (
                      <p className={savingsClass(carrier.savings)}>
                        Savings: {money(carrier.savings)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-slate-900"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}

          {!carrierSummary.length && (
            <div className="p-6 text-sm text-slate-600">
              No released carrier award analytics are available yet.
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            State-Pair Analytics
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Released lane performance by geography.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">State Pair</th>
                <th className="px-4 py-3">Lanes</th>
                <th className="px-4 py-3">Awarded</th>
                <th className="px-4 py-3">Shipments</th>
                {release?.show_bid_amounts && <th className="px-4 py-3">Awarded Spend</th>}
                {release?.show_savings && <th className="px-4 py-3">Savings</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {statePairSummary.slice(0, 40).map((row) => (
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

                  {release?.show_bid_amounts && (
                    <td className="px-4 py-3 text-slate-600">
                      {money(row.awardedCost)}
                    </td>
                  )}

                  {release?.show_savings && (
                    <td className={`px-4 py-3 font-semibold ${savingsClass(row.savings)}`}>
                      {money(row.savings)}
                    </td>
                  )}
                </tr>
              ))}

              {!statePairSummary.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    No released state-pair analytics are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Released Lane Detail
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            First 50 released lane award records.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Lane</th>
                <th className="px-4 py-3">Primary</th>
                <th className="px-4 py-3">Backup</th>
                {release?.show_bid_amounts && <th className="px-4 py-3">Awarded Cost</th>}
                {release?.show_savings && <th className="px-4 py-3">Savings</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {laneRows.slice(0, 50).map((row, index) => (
                <tr key={`${String(row.lane.id ?? index)}`}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {laneName(row.lane)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {row.award?.primary_carrier_name
                      ? displayCarrierName(row.award.primary_carrier_name, Boolean(release?.show_carrier_names))
                      : "-"}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {row.award?.backup_carrier_name
                      ? displayCarrierName(row.award.backup_carrier_name, Boolean(release?.show_carrier_names))
                      : "-"}
                  </td>

                  {release?.show_bid_amounts && (
                    <td className="px-4 py-3 text-slate-600">
                      {row.awardedCost !== null ? money(row.awardedCost) : "-"}
                    </td>
                  )}

                  {release?.show_savings && (
                    <td className={`px-4 py-3 font-semibold ${savingsClass(Number(row.savings ?? 0))}`}>
                      {row.savings !== null ? money(row.savings) : "-"}
                    </td>
                  )}
                </tr>
              ))}

              {!laneRows.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={5}>
                    No released lane analytics are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {laneRows.length > 50 && (
          <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            Showing first 50 lanes of {laneRows.length}. Use the CSV export for the full analytics file.
          </div>
        )}
      </section>
    </div>
  );
}