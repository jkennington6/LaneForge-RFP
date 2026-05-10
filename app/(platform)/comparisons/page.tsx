import Link from "next/link";
import { CsvDownloadButton } from "@/components/csv-download-button";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type LaneRow = {
  id: string;
  rfp_id: string;
  lane_state_pair: string | null;
  origin_city: string | null;
  origin_state: string | null;
  origin_zip: string | null;
  destination_city: string | null;
  destination_state: string | null;
  destination_zip: string | null;
  weight_break: string | null;
  freight_class: string | null;
  shipment_count: number;
  historical_spend: number | null;
  current_carrier: string | null;
};

type RfpRow = {
  id: string;
  name: string;
};

type CarrierRow = {
  id: string;
  organization_id: string;
  scac: string | null;
  inactive: boolean;
  is_excluded: boolean;
};

type OrganizationRow = {
  id: string;
  name: string;
};

type BidLineRow = {
  id: string;
  rfp_id: string;
  shipment_lane_id: string;
  carrier_id: string;
  linehaul: number | null;
  fuel: number | null;
  accessorials: number | null;
  total_cost: number;
  service_days: number | null;
  notes: string | null;
};

type RankedBidRow = {
  rank: number;
  lane: LaneRow;
  rfp: RfpRow | undefined;
  carrier: CarrierRow | undefined;
  carrierName: string;
  bid: BidLineRow;
  currentCost: number;
  savings: number;
  savingsPct: number;
  eligible: boolean;
  eligibilityNote: string;
};

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function buildRankedRows(
  lanes: LaneRow[],
  bids: BidLineRow[],
  rfpsById: Map<string, RfpRow>,
  carriersById: Map<string, CarrierRow>,
  orgById: Map<string, OrganizationRow>
) {
  const bidsByLane = new Map<string, BidLineRow[]>();

  for (const bid of bids) {
    const existing = bidsByLane.get(bid.shipment_lane_id) ?? [];
    existing.push(bid);
    bidsByLane.set(bid.shipment_lane_id, existing);
  }

  const rows: RankedBidRow[] = [];

  for (const lane of lanes) {
    const laneBids = bidsByLane.get(lane.id) ?? [];

    const ranked = laneBids
      .map((bid) => {
        const carrier = carriersById.get(bid.carrier_id);
        const carrierOrg = carrier ? orgById.get(carrier.organization_id) : undefined;
        const currentCost = Number(lane.historical_spend ?? 0);
        const savings = currentCost - Number(bid.total_cost ?? 0);
        const savingsPct = currentCost ? (savings / currentCost) * 100 : 0;

        const inactive = carrier?.inactive ?? false;
        const excluded = carrier?.is_excluded ?? false;
        const eligible = Boolean(carrier) && !inactive && !excluded;

        let eligibilityNote = "Eligible";
        if (!carrier) eligibilityNote = "Carrier not found";
        else if (inactive) eligibilityNote = "Inactive carrier";
        else if (excluded) eligibilityNote = "Excluded carrier";

        return {
          rank: 0,
          lane,
          rfp: rfpsById.get(lane.rfp_id),
          carrier,
          carrierName: carrierOrg?.name ?? "Unknown carrier",
          bid,
          currentCost,
          savings,
          savingsPct,
          eligible,
          eligibilityNote,
        };
      })
      .sort((a, b) => {
        if (a.bid.total_cost !== b.bid.total_cost) {
          return a.bid.total_cost - b.bid.total_cost;
        }

        return Number(a.bid.service_days ?? 999) - Number(b.bid.service_days ?? 999);
      })
      .map((row, index) => ({
        ...row,
        rank: index + 1,
      }));

    rows.push(...ranked);
  }

  return rows;
}

export default async function ComparisonsPage() {
  const supabase = createServiceSupabaseClient();

  const [lanesResult, bidsResult, rfpsResult, carriersResult, organizationsResult] =
    await Promise.all([
      supabase
        .from("shipment_lanes")
        .select(
          "id, rfp_id, lane_state_pair, origin_city, origin_state, origin_zip, destination_city, destination_state, destination_zip, weight_break, freight_class, shipment_count, historical_spend, current_carrier"
        )
        .order("lane_state_pair", { ascending: true }),

      supabase
        .from("manual_bid_lines")
        .select(
          "id, rfp_id, shipment_lane_id, carrier_id, linehaul, fuel, accessorials, total_cost, service_days, notes"
        )
        .order("total_cost", { ascending: true }),

      supabase.from("rfps").select("id, name"),

      supabase.from("carriers").select("id, organization_id, scac, inactive, is_excluded"),

      supabase.from("organizations").select("id, name"),
    ]);

  if (
    lanesResult.error ||
    bidsResult.error ||
    rfpsResult.error ||
    carriersResult.error ||
    organizationsResult.error
  ) {
    return (
      <div>
        <SectionHeader
          title="Bid Comparisons"
          description="Rank actual carrier bid lines by lane."
        />

        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Supabase error:{" "}
          {lanesResult.error?.message ??
            bidsResult.error?.message ??
            rfpsResult.error?.message ??
            carriersResult.error?.message ??
            organizationsResult.error?.message}
        </div>
      </div>
    );
  }

  const lanes = (lanesResult.data ?? []) as LaneRow[];
  const bids = (bidsResult.data ?? []) as BidLineRow[];
  const rfps = (rfpsResult.data ?? []) as RfpRow[];
  const carriers = (carriersResult.data ?? []) as CarrierRow[];
  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];

  const rfpsById = new Map(rfps.map((rfp) => [rfp.id, rfp]));
  const carriersById = new Map(carriers.map((carrier) => [carrier.id, carrier]));
  const orgById = new Map(organizations.map((org) => [org.id, org]));

  const rankedRows = buildRankedRows(lanes, bids, rfpsById, carriersById, orgById);

  const exportRows = rankedRows.map((row) => ({
    rfp: row.rfp?.name ?? "Unknown RFP",
    lane: row.lane.lane_state_pair ?? "Unknown lane",
    origin: `${row.lane.origin_city ?? ""} ${row.lane.origin_state ?? ""} ${row.lane.origin_zip ?? ""}`.trim(),
    destination: `${row.lane.destination_city ?? ""} ${row.lane.destination_state ?? ""} ${row.lane.destination_zip ?? ""}`.trim(),
    weight_break: row.lane.weight_break ?? "",
    class: row.lane.freight_class ?? "",
    shipments: row.lane.shipment_count,
    current_carrier: row.lane.current_carrier ?? "",
    current_cost: row.currentCost,
    rank: row.rank,
    bid_carrier: row.carrierName,
    eligible: row.eligible ? "Yes" : "No",
    linehaul: row.bid.linehaul ?? "",
    fuel: row.bid.fuel ?? "",
    accessorials: row.bid.accessorials ?? "",
    total_cost: row.bid.total_cost,
    service_days: row.bid.service_days ?? "",
    savings: row.savings,
    savings_percent: row.savingsPct.toFixed(1),
    notes: row.bid.notes ?? "",
  }));

  return (
    <div>
      <SectionHeader
        title="Bid Comparisons"
        description="Actual carrier bid rankings from manual bid lines."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/bid-entry"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Enter bids
            </Link>
            <CsvDownloadButton
              filename="actual-bid-comparisons.csv"
              rows={exportRows}
            />
          </div>
        }
      />

      <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        This page now uses actual records from manual_bid_lines. Ranking is by lowest total cost, with service days used as the tie-breaker.
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Eligibility</th>
              <th className="px-4 py-3">Current Cost</th>
              <th className="px-4 py-3">Bid Total</th>
              <th className="px-4 py-3">Savings</th>
              <th className="px-4 py-3">Savings %</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {rankedRows.map((row) => (
              <tr key={row.bid.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {row.lane.lane_state_pair ?? "Unknown lane"}
                  <div className="text-xs font-normal text-slate-400">
                    {row.rfp?.name ?? "Unknown RFP"} • {row.lane.origin_state} to{" "}
                    {row.lane.destination_state} • {row.lane.weight_break ?? "No break"} • Class{" "}
                    {row.lane.freight_class ?? "—"}
                  </div>
                </td>

                <td className="px-4 py-3 font-semibold text-slate-950">#{row.rank}</td>
                <td className="px-4 py-3 text-slate-600">{row.carrierName}</td>

                <td
                  className={`px-4 py-3 font-semibold ${
                    row.eligible ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {row.eligibilityNote}
                </td>

                <td className="px-4 py-3 text-slate-600">{money(row.currentCost)}</td>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {money(row.bid.total_cost)}
                </td>

                <td
                  className={`px-4 py-3 font-semibold ${
                    row.savings >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {money(row.savings)}
                </td>

                <td
                  className={`px-4 py-3 font-semibold ${
                    row.savingsPct >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {pct(row.savingsPct)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {row.bid.service_days ? `${row.bid.service_days} days` : "—"}
                </td>

                <td className="px-4 py-3 text-slate-500">{row.bid.notes ?? "—"}</td>
              </tr>
            ))}

            {!rankedRows.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={10}>
                  No manual carrier bid lines found yet. Go to Manual Bid Entry and add bids.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
