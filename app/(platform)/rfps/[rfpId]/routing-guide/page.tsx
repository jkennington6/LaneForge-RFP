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

export default async function RfpRoutingGuidePage({
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
          is_active,
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

  const guideRows = lanes.map((lane) => {
    const rankedRates: RankedRate[] = rates
      .filter((rate) => matchesLane(rate, lane))
      .map((rate) => ({
        ...rate,
        carrier_name: getCarrierName(rate),
        estimated_cost: calculateEstimatedCost(rate, lane),
      }))
      .filter((rate) => rate.estimated_cost !== null)
      .sort((a, b) => Number(a.estimated_cost) - Number(b.estimated_cost));

    const primary = rankedRates[0] ?? null;
    const backup = rankedRates[1] ?? null;
    const third = rankedRates[2] ?? null;

    const historicalSpend = Number(lane.historical_spend ?? 0);
    const savings =
      primary?.estimated_cost !== null && primary?.estimated_cost !== undefined
        ? historicalSpend - primary.estimated_cost
        : null;

    return {
      lane,
      primary,
      backup,
      third,
      savings,
      responseCount: rankedRates.length,
    };
  });

  const coveredLanes = guideRows.filter((row) => row.primary).length;
  const uncoveredLanes = guideRows.length - coveredLanes;

  const totalHistoricalSpend = lanes.reduce(
    (sum, lane) => sum + Number(lane.historical_spend ?? 0),
    0
  );

  const totalAwardCost = guideRows.reduce((sum, row) => {
    if (!row.primary?.estimated_cost) return sum;
    return sum + row.primary.estimated_cost;
  }, 0);

  const totalSavings = totalAwardCost > 0 ? totalHistoricalSpend - totalAwardCost : null;

  const carrierSummaryMap = new Map<
    string,
    {
      carrier: string;
      primaryLanes: number;
      estimatedSpend: number;
      shipments: number;
    }
  >();

  guideRows.forEach((row) => {
    if (!row.primary) return;

    const carrier = row.primary.carrier_name;
    const existing =
      carrierSummaryMap.get(carrier) ??
      {
        carrier,
        primaryLanes: 0,
        estimatedSpend: 0,
        shipments: 0,
      };

    existing.primaryLanes += 1;
    existing.estimatedSpend += Number(row.primary.estimated_cost ?? 0);
    existing.shipments += Number(row.lane.shipment_count ?? 0);

    carrierSummaryMap.set(carrier, existing);
  });

  const carrierSummary = Array.from(carrierSummaryMap.values()).sort(
    (a, b) => b.estimatedSpend - a.estimatedSpend
  );

  return (
    <div>
      <SectionHeader
        title="Draft Routing Guide"
        description={`${rfp.name} - primary, backup, and tertiary carrier recommendations by lane`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to RFP
            </Link>

            <Link
              href={`/rfps/${rfp.id}/routing-guide/export`}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
            >
              Download CSV
            </Link>

            <Link
              href={`/rfps/${rfp.id}/comparisons`}
              className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
            >
              Comparisons
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{guideRows.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Covered Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{coveredLanes}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Uncovered Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{uncoveredLanes}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Estimated Award Cost</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{money(totalAwardCost || null)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Estimated Savings</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{money(totalSavings)}</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        This is a draft routing guide generated from normalized carrier bid rows.
        Final award logic should later include service coverage, carrier exclusions,
        customer preferences, transit, and 3PL override controls.
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Carrier Award Summary</h2>
          <p className="mt-1 text-sm text-slate-600">
            Estimated primary carrier allocation based on the current lowest-cost recommendations.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Primary Lanes</th>
              <th className="px-4 py-3">Estimated Spend</th>
              <th className="px-4 py-3">Shipment Count</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {carrierSummary.map((carrier) => (
              <tr key={carrier.carrier}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {carrier.carrier}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {carrier.primaryLanes}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(carrier.estimatedSpend)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {carrier.shipments}
                </td>
              </tr>
            ))}

            {!carrierSummary.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={4}>
                  No carrier award summary is available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Lane Routing Guide</h2>
          <p className="mt-1 text-sm text-slate-600">
            Primary, backup, and third carrier by lane.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Origin</th>
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Shipments</th>
              <th className="px-4 py-3">Historical</th>
              <th className="px-4 py-3">Primary</th>
              <th className="px-4 py-3">Primary Cost</th>
              <th className="px-4 py-3">Backup</th>
              <th className="px-4 py-3">Third</th>
              <th className="px-4 py-3">Savings</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {guideRows.map((row) => (
              <tr key={row.lane.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {row.lane.lane_state_pair ?? "-"}
                  <div className="text-xs font-normal text-slate-500">
                    {row.responseCount} priced response(s)
                  </div>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {row.lane.origin_city ?? "-"}, {row.lane.origin_state ?? "-"} {row.lane.origin_zip ?? ""}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {row.lane.destination_city ?? "-"}, {row.lane.destination_state ?? "-"} {row.lane.destination_zip ?? ""}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {row.lane.shipment_count}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(row.lane.historical_spend)}
                </td>

                <td className="px-4 py-3 font-semibold text-slate-950">
                  {row.primary?.carrier_name ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(row.primary?.estimated_cost)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {row.backup?.carrier_name ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {row.third?.carrier_name ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(row.savings)}
                </td>
              </tr>
            ))}

            {!guideRows.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={10}>
                  No shipment lanes are available for routing guide generation.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}