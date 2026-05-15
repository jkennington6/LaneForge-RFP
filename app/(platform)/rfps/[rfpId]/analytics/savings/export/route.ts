import { requireRfpExportAccess } from "@/lib/rfp-access";

type AnyRow = Record<string, any>;

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

function laneName(lane: AnyRow) {
  return `${lane.lane_state_pair ?? "Lane"} - ${lane.origin_zip ?? "-"} to ${lane.destination_zip ?? "-"}`;
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

  const laneRows = lanes
    .map((lane) => {
      const award = awardsByLane.get(String(lane.id));
      const carrierName = String(award?.primary_carrier_name ?? "").trim();

      const historicalSpend = numberValue(lane, [
        "historical_spend",
        "current_spend",
        "current_total",
        "total_spend",
        "spend",
      ]);

      const awardedCost =
        carrierName &&
        award?.primary_estimated_cost !== null &&
        award?.primary_estimated_cost !== undefined
          ? Number(award.primary_estimated_cost)
          : null;

      const savings = awardedCost !== null ? historicalSpend - awardedCost : null;

      return {
        rowType: "lane_detail",
        laneId: String(lane.id ?? ""),
        laneName: laneName(lane),
        laneStatePair: String(lane.lane_state_pair ?? "Unknown"),
        originZip: String(lane.origin_zip ?? ""),
        destinationZip: String(lane.destination_zip ?? ""),
        carrierName,
        historicalSpend,
        awardedCost,
        savings,
      };
    })
    .filter((row) => row.awardedCost !== null);

  const totalHistoricalSpend = laneRows.reduce((sum, row) => sum + row.historicalSpend, 0);
  const totalAwardedCost = laneRows.reduce((sum, row) => sum + Number(row.awardedCost ?? 0), 0);
  const grossSavings = laneRows
    .filter((row) => Number(row.savings ?? 0) > 0)
    .reduce((sum, row) => sum + Number(row.savings ?? 0), 0);
  const grossIncreases = laneRows
    .filter((row) => Number(row.savings ?? 0) < 0)
    .reduce((sum, row) => sum + Math.abs(Number(row.savings ?? 0)), 0);
  const netSavings = totalHistoricalSpend - totalAwardedCost;

  const summaryRows = [
    ["summary", "Historical Baseline", "", "", "", "", "", totalHistoricalSpend, "", "", ""],
    ["summary", "Gross Savings", "", "", "", "", "", "", "", grossSavings, ""],
    ["summary", "Gross Cost Increases", "", "", "", "", "", "", "", -grossIncreases, ""],
    ["summary", "Net Savings", "", "", "", "", "", totalHistoricalSpend, totalAwardedCost, netSavings, totalHistoricalSpend > 0 ? netSavings / totalHistoricalSpend : 0],
    ["summary", "Awarded Spend", "", "", "", "", "", "", totalAwardedCost, "", ""],
  ];

  const statePairMap = new Map<
    string,
    {
      laneCount: number;
      historicalSpend: number;
      awardedCost: number;
      savings: number;
    }
  >();

  laneRows.forEach((row) => {
    const existing =
      statePairMap.get(row.laneStatePair) ??
      {
        laneCount: 0,
        historicalSpend: 0,
        awardedCost: 0,
        savings: 0,
      };

    existing.laneCount += 1;
    existing.historicalSpend += row.historicalSpend;
    existing.awardedCost += Number(row.awardedCost ?? 0);
    existing.savings += Number(row.savings ?? 0);

    statePairMap.set(row.laneStatePair, existing);
  });

  const statePairRows = Array.from(statePairMap.entries())
    .sort((a, b) => Math.abs(b[1].savings) - Math.abs(a[1].savings))
    .map(([statePair, value]) => [
      "state_pair_summary",
      statePair,
      "",
      statePair,
      "",
      "",
      "",
      value.historicalSpend,
      value.awardedCost,
      value.savings,
      value.historicalSpend > 0 ? value.savings / value.historicalSpend : 0
    ]);

  const detailRows = laneRows
    .sort((a, b) => Math.abs(Number(b.savings ?? 0)) - Math.abs(Number(a.savings ?? 0)))
    .map((row) => [
      "lane_detail",
      row.laneName,
      row.laneId,
      row.laneStatePair,
      row.originZip,
      row.destinationZip,
      row.carrierName,
      row.historicalSpend,
      row.awardedCost ?? "",
      row.savings ?? "",
      row.historicalSpend > 0 && row.savings !== null ? row.savings / row.historicalSpend : 0
    ]);

  const headers = [
    "row_type",
    "name",
    "lane_id",
    "lane_state_pair",
    "origin_zip",
    "destination_zip",
    "carrier_name",
    "historical_spend",
    "awarded_cost",
    "estimated_savings",
    "savings_percent"
  ];

  const csv = [
    headers.map(csvEscape).join(","),
    ...summaryRows.map((row) => row.map(csvEscape).join(",")),
    ...statePairRows.map((row) => row.map(csvEscape).join(",")),
    ...detailRows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-savings-bridge.csv"`,
    },
  });
}