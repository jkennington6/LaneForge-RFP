import { requireRfpExportAccess } from "@/lib/rfp-access";

type AnyRow = Record<string, any>;

type GeoSummary = {
  groupType: string;
  key: string;
  laneCount: number;
  awardedLaneCount: number;
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

function addToSummary(
  map: Map<string, GeoSummary>,
  groupType: string,
  key: string,
  row: {
    shipmentCount: number;
    historicalSpend: number;
    awardedCost: number | null;
    savings: number | null;
  }
) {
  const cleanKey = key || "Unknown";
  const mapKey = `${groupType}|${cleanKey}`;

  const existing =
    map.get(mapKey) ??
    {
      groupType,
      key: cleanKey,
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
    existing.awardedCost += row.awardedCost;
    existing.savings += row.savings ?? 0;
  }

  map.set(mapKey, existing);
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

  const summaryMap = new Map<string, GeoSummary>();

  lanes.forEach((lane) => {
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

    const originState = String(lane.origin_state ?? "").trim() || "Unknown";
    const destinationState = String(lane.destination_state ?? "").trim() || "Unknown";
    const statePair = String(lane.lane_state_pair ?? `${originState}${destinationState}`).trim() || "Unknown";
    const originZip = String(lane.origin_zip ?? "").trim();
    const destinationZip = String(lane.destination_zip ?? "").trim();

    const summaryRow = {
      shipmentCount,
      historicalSpend,
      awardedCost,
      savings,
    };

    addToSummary(summaryMap, "state_pair", statePair, summaryRow);
    addToSummary(summaryMap, "origin_state", originState, summaryRow);
    addToSummary(summaryMap, "destination_state", destinationState, summaryRow);
    addToSummary(summaryMap, "origin_zip3", originZip.length >= 3 ? originZip.slice(0, 3) : "Unknown", summaryRow);
    addToSummary(summaryMap, "destination_zip3", destinationZip.length >= 3 ? destinationZip.slice(0, 3) : "Unknown", summaryRow);
  });

  const headers = [
    "rfp_name",
    "group_type",
    "group_key",
    "lane_count",
    "awarded_lane_count",
    "award_coverage_percent",
    "shipment_count",
    "historical_spend",
    "awarded_cost",
    "estimated_savings",
    "savings_percent"
  ];

  const rows = Array.from(summaryMap.values())
    .sort((a, b) => {
      if (a.groupType !== b.groupType) return a.groupType.localeCompare(b.groupType);
      return Math.abs(b.savings) - Math.abs(a.savings);
    })
    .map((row) => [
      rfp.name ?? "RFP",
      row.groupType,
      row.key,
      row.laneCount,
      row.awardedLaneCount,
      row.laneCount > 0 ? row.awardedLaneCount / row.laneCount : 0,
      row.shipmentCount,
      row.historicalSpend,
      row.awardedCost,
      row.savings,
      row.historicalSpend > 0 ? row.savings / row.historicalSpend : 0
    ]);

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-geography-analytics.csv"`,
    },
  });
}