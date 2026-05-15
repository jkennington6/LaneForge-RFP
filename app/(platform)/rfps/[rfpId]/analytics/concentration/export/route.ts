import { requireRfpExportAccess } from "@/lib/rfp-access";

type AnyRow = Record<string, any>;

type CarrierSummary = {
  carrierName: string;
  laneCount: number;
  shipmentCount: number;
  historicalSpend: number;
  awardedCost: number;
  savings: number;
};

function csvEscape(value: unknown) {
  const raw = String(value ?? "");
  return `"${raw.replaceAll('"', '""')}"`;
}

function safeFilename(value: string) {
  return value
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

function concentrationLabel(hhi: number) {
  if (hhi >= 2500) return "Highly concentrated";
  if (hhi >= 1500) return "Moderately concentrated";
  return "Diversified";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rfpId: string }> }
) {
  const { rfpId } = await params;

  const access = await requireRfpExportAccess(rfpId);

  if (!access.allowed) {
    return new Response(access.error, { status: access.status });
  }

  const supabase = access.supabase;
  const rfp = access.rfp;

  const [lanesResult, awardsResult] = await Promise.all([
    supabase.from("shipment_lanes").select("*").eq("rfp_id", rfpId),
    supabase.from("rfp_lane_awards").select("*").eq("rfp_id", rfpId),
  ]);

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);

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

  const carriers = Array.from(carrierMap.values()).sort(
    (a, b) => b.awardedCost - a.awardedCost
  );

  const totalAwardedSpend = carriers.reduce((sum, row) => sum + row.awardedCost, 0);
  const totalAwardedLanes = carriers.reduce((sum, row) => sum + row.laneCount, 0);
  const totalShipments = carriers.reduce((sum, row) => sum + row.shipmentCount, 0);

  const hhi =
    totalAwardedSpend > 0
      ? carriers.reduce((sum, row) => {
          const share = row.awardedCost / totalAwardedSpend;
          return sum + share * share * 10000;
        }, 0)
      : 0;

  const headers = [
    "rfp_name",
    "concentration_score_hhi",
    "concentration_label",
    "carrier_name",
    "lane_count",
    "lane_share",
    "shipment_count",
    "shipment_share",
    "historical_spend",
    "awarded_cost",
    "awarded_spend_share",
    "estimated_savings",
    "savings_percent"
  ];

  const rows = carriers.map((carrier) => [
    rfp.name ?? "RFP",
    Math.round(hhi),
    concentrationLabel(hhi),
    carrier.carrierName,
    carrier.laneCount,
    totalAwardedLanes > 0 ? carrier.laneCount / totalAwardedLanes : 0,
    carrier.shipmentCount,
    totalShipments > 0 ? carrier.shipmentCount / totalShipments : 0,
    carrier.historicalSpend,
    carrier.awardedCost,
    totalAwardedSpend > 0 ? carrier.awardedCost / totalAwardedSpend : 0,
    carrier.savings,
    carrier.historicalSpend > 0 ? carrier.savings / carrier.historicalSpend : 0
  ]);

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-carrier-concentration.csv"`,
    },
  });
}