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

function savingsClass(value: number) {
  if (value > 0) return "text-green-700";
  if (value < 0) return "text-red-700";
  return "text-slate-700";
}

function displayCarrierName(value: unknown, showCarrierNames: boolean) {
  if (!value) return "Unassigned";
  return showCarrierNames ? String(value) : "Released carrier";
}

function laneName(lane: AnyRow) {
  return `${lane.lane_state_pair ?? "Lane"} - ${lane.origin_zip ?? "-"} to ${lane.destination_zip ?? "-"}`;
}

function printDate() {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function CustomerExecutiveAnalyticsReportPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;

  const user = await requireCustomerPortalUser();
  const customerOrgIds = (await getCustomerOrgIdsForCurrentUser(user)) ?? [];

  if (!customerOrgIds.length) {
    notFound();
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
      .eq("rfp_id", rfpId),

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
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link
          href={`/customer/rfps/${rfpId}`}
          className="text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          Back to RFP
        </Link>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h1 className="text-xl font-bold text-amber-950">
            Executive Report Not Released
          </h1>

          <p className="mt-2 text-sm">
            A customer-facing executive analytics report has not been released for this RFP yet.
          </p>
        </div>
      </div>
    );
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

  const unawardedLaneCount = Math.max(0, lanes.length - awardedRows.length);
  const totalHistoricalSpend = laneRows.reduce((sum, row) => sum + row.historicalSpend, 0);
  const totalAwardedCost = awardedRows.reduce((sum, row) => sum + Number(row.awardedCost ?? 0), 0);
  const totalSavings = totalHistoricalSpend - totalAwardedCost;
  const totalSavingsPercent = totalHistoricalSpend > 0 ? totalSavings / totalHistoricalSpend : 0;
  const awardCoverage = lanes.length > 0 ? awardedRows.length / lanes.length : 0;

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

  const topSavingsLanes = laneRows
    .filter((row) => Number(row.savings ?? 0) > 0)
    .sort((a, b) => Number(b.savings ?? 0) - Number(a.savings ?? 0))
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl bg-white px-6 py-8 text-slate-950 print:px-0 print:py-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/customer/rfps/${rfpId}/analytics`}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to Analytics
        </Link>

        <button
          type="button"
          onClick={undefined}
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        >
          Use browser print or Ctrl+P
        </button>
      </div>

      <header className="border-b border-slate-300 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          LaneForge Customer RFP Report
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          {rfp.name ?? "RFP"} Executive Summary
        </h1>

        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
          <p><span className="font-semibold text-slate-900">Mode:</span> {rfp.mode ?? "Not provided"}</p>
          <p><span className="font-semibold text-slate-900">Status:</span> {rfp.status ?? "Not provided"}</p>
          <p><span className="font-semibold text-slate-900">Report Date:</span> {printDate()}</p>
        </div>
      </header>

      {release?.release_notes && (
        <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
          <h2 className="font-bold text-blue-950">Release Notes</h2>
          <p className="mt-2 whitespace-pre-line">{release.release_notes}</p>
        </section>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Award Coverage</p>
          <p className="mt-2 text-2xl font-bold">{percent(awardCoverage)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {awardedRows.length} awarded / {lanes.length} lanes
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Estimated Savings</p>
          <p className={`mt-2 text-2xl font-bold ${savingsClass(totalSavings)}`}>
            {release?.show_savings ? money(totalSavings) : "Hidden"}
          </p>
          {release?.show_savings && (
            <p className="mt-1 text-xs text-slate-500">
              {percent(totalSavingsPercent)}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Awarded Spend</p>
          <p className="mt-2 text-2xl font-bold">
            {release?.show_bid_amounts ? money(totalAwardedCost) : "Hidden"}
          </p>
          {release?.show_savings && (
            <p className="mt-1 text-xs text-slate-500">
              Historical: {money(totalHistoricalSpend)}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Unawarded Lanes</p>
          <p className="mt-2 text-2xl font-bold">{unawardedLaneCount}</p>
          <p className="mt-1 text-xs text-slate-500">
            Remaining review items
          </p>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 p-5">
        <h2 className="text-xl font-bold">Executive Summary</h2>

        <div className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
          <p>
            This RFP package includes <strong>{lanes.length}</strong> shipment lane records, with <strong>{awardedRows.length}</strong> lanes currently represented in the released award summary.
          </p>

          {release?.show_savings && (
            <p>
              The released award view shows estimated savings of <strong>{money(totalSavings)}</strong>, equal to <strong>{percent(totalSavingsPercent)}</strong> against the available historical baseline.
            </p>
          )}

          {!release?.show_savings && (
            <p>
              Savings detail is not currently released in this customer-facing report.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-5">
          <h2 className="text-lg font-bold">Released Carrier Summary</h2>

          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Carrier</th>
                <th className="py-2 text-right">Lanes</th>
                {release?.show_bid_amounts && <th className="py-2 text-right">Spend</th>}
                {release?.show_savings && <th className="py-2 text-right">Savings</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {carrierSummary.slice(0, 10).map((carrier) => (
                <tr key={carrier.carrierName}>
                  <td className="py-2 font-semibold">{carrier.carrierName}</td>
                  <td className="py-2 text-right">{carrier.laneCount}</td>
                  {release?.show_bid_amounts && (
                    <td className="py-2 text-right">{money(carrier.awardedCost)}</td>
                  )}
                  {release?.show_savings && (
                    <td className={`py-2 text-right font-semibold ${savingsClass(carrier.savings)}`}>
                      {money(carrier.savings)}
                    </td>
                  )}
                </tr>
              ))}

              {!carrierSummary.length && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={4}>
                    No released carrier awards are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <h2 className="text-lg font-bold">Released State-Pair Summary</h2>

          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">State Pair</th>
                <th className="py-2 text-right">Lanes</th>
                <th className="py-2 text-right">Awarded</th>
                {release?.show_savings && <th className="py-2 text-right">Savings</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {statePairSummary.slice(0, 10).map((row) => (
                <tr key={row.laneStatePair}>
                  <td className="py-2 font-semibold">{row.laneStatePair}</td>
                  <td className="py-2 text-right">{row.laneCount}</td>
                  <td className="py-2 text-right">{row.awardedLaneCount}</td>
                  {release?.show_savings && (
                    <td className={`py-2 text-right font-semibold ${savingsClass(row.savings)}`}>
                      {money(row.savings)}
                    </td>
                  )}
                </tr>
              ))}

              {!statePairSummary.length && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={4}>
                    No released state-pair summary is available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {release?.show_savings && (
        <section className="mt-8 rounded-2xl border border-green-200 p-5">
          <h2 className="text-lg font-bold text-green-900">Top Released Savings Lanes</h2>

          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Lane</th>
                <th className="py-2 text-right">Savings</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {topSavingsLanes.map((row, index) => (
                <tr key={`${String(row.lane.id)}-${index}`}>
                  <td className="py-2 font-semibold">{laneName(row.lane)}</td>
                  <td className="py-2 text-right font-semibold text-green-700">
                    {money(row.savings)}
                  </td>
                </tr>
              ))}

              {!topSavingsLanes.length && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={2}>
                    No positive savings lanes are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <footer className="mt-10 border-t border-slate-300 pt-4 text-xs text-slate-500">
        Generated by LaneForge. This report only includes analytics released to the customer by the managing organization.
      </footer>
    </div>
  );
}