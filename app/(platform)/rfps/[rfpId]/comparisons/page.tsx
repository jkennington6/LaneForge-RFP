import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type LaneRow = {
  id: string;
  lane_state_pair: string | null;
  origin_city: string | null;
  origin_state: string | null;
  origin_zip: string | null;
  destination_city: string | null;
  destination_state: string | null;
  destination_zip: string | null;
  weight: number | null;
  weight_break: string | null;
  freight_class: string | null;
  shipment_count: number;
  historical_spend: number | null;
  current_carrier: string | null;
};

type RateRow = {
  id: string;
  submission_id: string;
  rfp_id: string;
  lane_id: string | null;
  origin_zip: string | null;
  destination_zip: string | null;
  origin_state: string | null;
  destination_state: string | null;
  lane_state_pair: string | null;
  weight_break: string | null;
  freight_class: string | null;
  discount: number | null;
  minimum_charge: number | null;
  rate_per_lb: number | null;
  accessorial_charge: number | null;
  transit_days: number | null;
  notes: string | null;
  carrier_bid_submissions:
    | {
        carrier_name: string;
        original_filename: string | null;
      }
    | {
        carrier_name: string;
        original_filename: string | null;
      }[]
    | null;
};

type RankedRate = RateRow & {
  carrier_name: string;
  estimated_cost: number | null;
};

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${value}%`;
}

function getCarrierName(rate: RateRow) {
  const submission = Array.isArray(rate.carrier_bid_submissions)
    ? rate.carrier_bid_submissions[0]
    : rate.carrier_bid_submissions;

  return submission?.carrier_name ?? "Unknown Carrier";
}

function matchesLane(rate: RateRow, lane: LaneRow) {
  if (rate.lane_id && rate.lane_id === lane.id) return true;

  const originZipMatch =
    rate.origin_zip &&
    lane.origin_zip &&
    rate.origin_zip.trim() === lane.origin_zip.trim();

  const destinationZipMatch =
    rate.destination_zip &&
    lane.destination_zip &&
    rate.destination_zip.trim() === lane.destination_zip.trim();

  const weightBreakMatch =
    !rate.weight_break ||
    !lane.weight_break ||
    rate.weight_break.trim() === lane.weight_break.trim();

  const classMatch =
    !rate.freight_class ||
    !lane.freight_class ||
    rate.freight_class.trim() === lane.freight_class.trim();

  return Boolean(originZipMatch && destinationZipMatch && weightBreakMatch && classMatch);
}

function calculateEstimatedCost(rate: RateRow, lane: LaneRow) {
  const weight = Number(lane.weight ?? 0);
  const shipmentCount = Number(lane.shipment_count ?? 1);
  const accessorial = Number(rate.accessorial_charge ?? 0);

  let shipmentCost: number | null = null;

  if (rate.rate_per_lb !== null && rate.rate_per_lb !== undefined && weight > 0) {
    shipmentCost = Number(rate.rate_per_lb) * weight;
  }

  if (rate.minimum_charge !== null && rate.minimum_charge !== undefined) {
    const minimum = Number(rate.minimum_charge);

    if (shipmentCost === null) {
      shipmentCost = minimum;
    } else {
      shipmentCost = Math.max(shipmentCost, minimum);
    }
  }

  if (shipmentCost === null) {
    return null;
  }

  return (shipmentCost + accessorial) * shipmentCount;
}

export default async function RfpComparisonsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, lanesResult, ratesResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, mode, status, bid_due_date")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("shipment_lanes")
      .select(
        "id, lane_state_pair, origin_city, origin_state, origin_zip, destination_city, destination_state, destination_zip, weight, weight_break, freight_class, shipment_count, historical_spend, current_carrier"
      )
      .eq("rfp_id", rfpId)
      .order("lane_state_pair", { ascending: true }),

    supabase
      .from("carrier_bid_lane_rates")
      .select(`
        id,
        submission_id,
        rfp_id,
        lane_id,
        origin_zip,
        destination_zip,
        origin_state,
        destination_state,
        lane_state_pair,
        weight_break,
        freight_class,
        discount,
        minimum_charge,
        rate_per_lb,
        accessorial_charge,
        transit_days,
        notes,
        carrier_bid_submissions (
          carrier_name,
          original_filename
        )
      `)
      .eq("rfp_id", rfpId),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (lanesResult.error) {
    throw new Error(lanesResult.error.message);
  }

  if (ratesResult.error) {
    throw new Error(ratesResult.error.message);
  }

  const rfp = rfpResult.data;
  const lanes = (lanesResult.data ?? []) as LaneRow[];
  const rates = (ratesResult.data ?? []) as RateRow[];

  const comparisons = lanes.map((lane) => {
    const matchingRates: RankedRate[] = rates
      .filter((rate) => matchesLane(rate, lane))
      .map((rate) => ({
        ...rate,
        carrier_name: getCarrierName(rate),
        estimated_cost: calculateEstimatedCost(rate, lane),
      }))
      .sort((a, b) => {
        if (a.estimated_cost === null && b.estimated_cost === null) return 0;
        if (a.estimated_cost === null) return 1;
        if (b.estimated_cost === null) return -1;
        return a.estimated_cost - b.estimated_cost;
      });

    const pricedRates = matchingRates.filter((rate) => rate.estimated_cost !== null);
    const winner = pricedRates[0] ?? null;
    const backup = pricedRates[1] ?? null;

    const historicalSpend = Number(lane.historical_spend ?? 0);
    const estimatedSavings =
      winner?.estimated_cost !== null && winner?.estimated_cost !== undefined
        ? historicalSpend - winner.estimated_cost
        : null;

    return {
      lane,
      matchingRates,
      pricedRates,
      winner,
      backup,
      estimatedSavings,
    };
  });

  const lanesWithResponses = comparisons.filter(
    (comparison) => comparison.matchingRates.length > 0
  ).length;

  const lanesWithPricedResponses = comparisons.filter(
    (comparison) => comparison.pricedRates.length > 0
  ).length;

  const totalHistoricalSpend = lanes.reduce(
    (sum, lane) => sum + Number(lane.historical_spend ?? 0),
    0
  );

  const estimatedAwardCost = comparisons.reduce((sum, comparison) => {
    if (comparison.winner?.estimated_cost === null || comparison.winner?.estimated_cost === undefined) {
      return sum;
    }

    return sum + comparison.winner.estimated_cost;
  }, 0);

  const estimatedSavings =
    estimatedAwardCost > 0 ? totalHistoricalSpend - estimatedAwardCost : null;

  return (
    <div>
      <SectionHeader
        title="Bid Comparisons"
        description={`${rfp.name} - ${rfp.mode} - ${rfp.status}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to RFP
            </Link>

            <Link
              href={`/rfps/${rfp.id}/comparisons/export`}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
            >
              Download CSV
            </Link>

            <Link
              href={`/rfps/${rfp.id}/bids`}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Bid Responses
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">RFP Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{lanes.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Lanes With Responses</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{lanesWithResponses}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Priced Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{lanesWithPricedResponses}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Estimated Award Cost</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{money(estimatedAwardCost || null)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Estimated Savings</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{money(estimatedSavings)}</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Current comparison logic uses rate_per_lb and minimum_charge to estimate lane cost.
        Discount-only rows are preserved but cannot be cost-ranked until a base tariff charge is available.
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Lane Award Comparison</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ranked by estimated cost where enough pricing data exists.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Shipments</th>
              <th className="px-4 py-3">Historical</th>
              <th className="px-4 py-3">Incumbent</th>
              <th className="px-4 py-3">Winner</th>
              <th className="px-4 py-3">Award Cost</th>
              <th className="px-4 py-3">Savings</th>
              <th className="px-4 py-3">Backup</th>
              <th className="px-4 py-3">Responses</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {comparisons.map((comparison) => (
              <tr key={comparison.lane.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {comparison.lane.lane_state_pair ?? "-"}
                  <div className="text-xs font-normal text-slate-500">
                    {comparison.lane.origin_zip ?? "-"} to {comparison.lane.destination_zip ?? "-"}
                  </div>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {comparison.lane.shipment_count}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(comparison.lane.historical_spend)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {comparison.lane.current_carrier ?? "-"}
                </td>

                <td className="px-4 py-3 font-semibold text-slate-950">
                  {comparison.winner?.carrier_name ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(comparison.winner?.estimated_cost)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(comparison.estimatedSavings)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {comparison.backup?.carrier_name ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {comparison.matchingRates.length}
                </td>
              </tr>
            ))}

            {!comparisons.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={9}>
                  No shipment lanes are available for comparison.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Detailed Carrier Rankings</h2>
          <p className="mt-1 text-sm text-slate-600">
            Top carrier options by lane. This becomes the routing guide source next.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Estimated Cost</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Min</th>
              <th className="px-4 py-3">Rate/LB</th>
              <th className="px-4 py-3">Transit</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {comparisons.flatMap((comparison) =>
              comparison.matchingRates.slice(0, 5).map((rate, index) => (
                <tr key={`${comparison.lane.id}-${rate.id}`}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {comparison.lane.lane_state_pair ?? "-"}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {rate.estimated_cost === null ? "-" : index + 1}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {rate.carrier_name}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {money(rate.estimated_cost)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {pct(rate.discount)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {money(rate.minimum_charge)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {money(rate.rate_per_lb)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {rate.transit_days ?? "-"}
                  </td>
                </tr>
              ))
            )}

            {!rates.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={8}>
                  No carrier bid rates are available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}