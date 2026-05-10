import Link from "next/link";
import { CsvDownloadButton } from "@/components/csv-download-button";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type LaneRow = {
  id: string;
  rfp_id: string;
  lane_state_pair: string | null;
  origin_state: string | null;
  destination_state: string | null;
  weight_break: string | null;
  freight_class: string | null;
  shipment_count: number;
  historical_spend: number | null;
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
  total_cost: number;
  service_days: number | null;
  notes: string | null;
};

type RoutingRow = {
  rfpName: string;
  lane: string;
  origin: string;
  destination: string;
  weightBreak: string;
  class: string;
  shipments: number;
  historicalSpend: number;
  primary: string;
  primaryCost: number | null;
  backup1: string;
  backup1Cost: number | null;
  backup2: string;
  backup2Cost: number | null;
  logic: string;
};

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function buildRoutingRows(
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

  const rows: RoutingRow[] = [];

  for (const lane of lanes) {
    const laneBids = bidsByLane.get(lane.id) ?? [];

    const eligibleBids = laneBids
      .filter((bid) => {
        const carrier = carriersById.get(bid.carrier_id);
        return carrier && !carrier.inactive && !carrier.is_excluded;
      })
      .sort((a, b) => {
        if (a.total_cost !== b.total_cost) {
          return a.total_cost - b.total_cost;
        }

        return Number(a.service_days ?? 999) - Number(b.service_days ?? 999);
      });

    const getCarrierName = (bid: BidLineRow | undefined) => {
      if (!bid) return "No award";
      const carrier = carriersById.get(bid.carrier_id);
      if (!carrier) return "Unknown carrier";
      return orgById.get(carrier.organization_id)?.name ?? "Unnamed carrier";
    };

    const primary = eligibleBids[0];
    const backup1 = eligibleBids[1];
    const backup2 = eligibleBids[2];

    let logic = "Lowest eligible total cost";
    if (!eligibleBids.length) {
      logic = "No eligible bids entered";
    } else if (eligibleBids.length === 1) {
      logic = "Only one eligible bid entered";
    } else {
      logic = "Lowest eligible total cost; service days used as tie-breaker";
    }

    rows.push({
      rfpName: rfpsById.get(lane.rfp_id)?.name ?? "Unknown RFP",
      lane: lane.lane_state_pair ?? "Unknown lane",
      origin: lane.origin_state ?? "—",
      destination: lane.destination_state ?? "—",
      weightBreak: lane.weight_break ?? "—",
      class: lane.freight_class ?? "—",
      shipments: lane.shipment_count,
      historicalSpend: Number(lane.historical_spend ?? 0),
      primary: getCarrierName(primary),
      primaryCost: primary?.total_cost ?? null,
      backup1: getCarrierName(backup1),
      backup1Cost: backup1?.total_cost ?? null,
      backup2: getCarrierName(backup2),
      backup2Cost: backup2?.total_cost ?? null,
      logic,
    });
  }

  return rows;
}

export default async function RoutingGuidesPage() {
  const supabase = createServiceSupabaseClient();

  const [lanesResult, bidsResult, rfpsResult, carriersResult, organizationsResult] =
    await Promise.all([
      supabase
        .from("shipment_lanes")
        .select(
          "id, rfp_id, lane_state_pair, origin_state, destination_state, weight_break, freight_class, shipment_count, historical_spend"
        )
        .order("lane_state_pair", { ascending: true }),

      supabase
        .from("manual_bid_lines")
        .select("id, rfp_id, shipment_lane_id, carrier_id, total_cost, service_days, notes"),

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
          title="Routing Guides"
          description="Award primary and backup carriers from actual bid lines."
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

  const routingRows = buildRoutingRows(lanes, bids, rfpsById, carriersById, orgById);

  const exportRows = routingRows.map((row) => ({
    rfp: row.rfpName,
    lane: row.lane,
    origin: row.origin,
    destination: row.destination,
    weight_break: row.weightBreak,
    class: row.class,
    shipments: row.shipments,
    historical_spend: row.historicalSpend,
    primary_carrier: row.primary,
    primary_cost: row.primaryCost ?? "",
    backup_1: row.backup1,
    backup_1_cost: row.backup1Cost ?? "",
    backup_2: row.backup2,
    backup_2_cost: row.backup2Cost ?? "",
    logic: row.logic,
  }));

  return (
    <div>
      <SectionHeader
        title="Routing Guides"
        description="Actual routing guide awards using manual carrier bid lines."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/bid-entry"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Enter bids
            </Link>
            <CsvDownloadButton
              filename="actual-routing-guide.csv"
              rows={exportRows}
            />
          </div>
        }
      />

      <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        This routing guide now excludes inactive/excluded carriers and awards by lowest eligible bid total.
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Primary</th>
              <th className="px-4 py-3">Primary Cost</th>
              <th className="px-4 py-3">Backup 1</th>
              <th className="px-4 py-3">Backup 1 Cost</th>
              <th className="px-4 py-3">Backup 2</th>
              <th className="px-4 py-3">Backup 2 Cost</th>
              <th className="px-4 py-3">Logic</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {routingRows.map((row, index) => (
              <tr key={`${row.rfpName}-${row.lane}-${index}`}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {row.lane}
                  <div className="text-xs font-normal text-slate-400">
                    {row.rfpName} • {row.origin} to {row.destination} •{" "}
                    {row.weightBreak} • Class {row.class}
                  </div>
                </td>

                <td className="px-4 py-3 font-semibold text-slate-950">{row.primary}</td>
                <td className="px-4 py-3 text-slate-600">{money(row.primaryCost)}</td>
                <td className="px-4 py-3 text-slate-600">{row.backup1}</td>
                <td className="px-4 py-3 text-slate-600">{money(row.backup1Cost)}</td>
                <td className="px-4 py-3 text-slate-600">{row.backup2}</td>
                <td className="px-4 py-3 text-slate-600">{money(row.backup2Cost)}</td>
                <td className="px-4 py-3 text-slate-500">{row.logic}</td>
              </tr>
            ))}

            {!routingRows.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={8}>
                  No lanes available for routing guide.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
