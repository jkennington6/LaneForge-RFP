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

function moneyNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
    supabase
      .from("shipment_lanes")
      .select("*")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_lane_awards")
      .select("*")
      .eq("rfp_id", rfpId),
  ]);

  if (lanesResult.error) {
    throw new Error(lanesResult.error.message);
  }

  if (awardsResult.error) {
    throw new Error(awardsResult.error.message);
  }

  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];

  const lanesById = new Map<string, AnyRow>();
  lanes.forEach((lane) => lanesById.set(String(lane.id), lane));

  const awardedRows = awards
    .filter((award) => award.primary_carrier_name)
    .map((award) => {
      const lane = lanesById.get(String(award.lane_id)) ?? {};
      const historicalSpend = moneyNumber(lane.historical_spend);
      const awardedCost = moneyNumber(award.primary_estimated_cost);
      const estimatedSavings =
        award.primary_estimated_cost !== null &&
        award.primary_estimated_cost !== undefined
          ? historicalSpend - awardedCost
          : 0;

      return {
        award,
        lane,
        carrierName: String(award.primary_carrier_name ?? "Unassigned"),
        shipmentCount: moneyNumber(lane.shipment_count),
        historicalSpend,
        awardedCost,
        estimatedSavings,
      };
    });

  const summaryByCarrier = new Map<
    string,
    {
      carrierName: string;
      laneCount: number;
      shipmentCount: number;
      historicalSpend: number;
      awardedCost: number;
      estimatedSavings: number;
    }
  >();

  awardedRows.forEach((row) => {
    const existing =
      summaryByCarrier.get(row.carrierName) ??
      {
        carrierName: row.carrierName,
        laneCount: 0,
        shipmentCount: 0,
        historicalSpend: 0,
        awardedCost: 0,
        estimatedSavings: 0,
      };

    existing.laneCount += 1;
    existing.shipmentCount += row.shipmentCount;
    existing.historicalSpend += row.historicalSpend;
    existing.awardedCost += row.awardedCost;
    existing.estimatedSavings += row.estimatedSavings;

    summaryByCarrier.set(row.carrierName, existing);
  });

  const totalAwardedLanes = awardedRows.length;

  const carrierSummary = Array.from(summaryByCarrier.values()).sort(
    (a, b) => b.awardedCost - a.awardedCost
  );

  const headers = [
    "row_type",
    "rfp_name",
    "carrier_name",
    "lane_count",
    "lane_share",
    "shipment_count",
    "historical_spend",
    "awarded_cost",
    "estimated_savings",
    "savings_percent",
    "lane_id",
    "lane_state_pair",
    "origin_city",
    "origin_state",
    "origin_zip",
    "destination_city",
    "destination_state",
    "destination_zip",
    "award_status",
    "backup_carrier",
    "third_carrier",
    "award_notes"
  ];

  const summaryRows = carrierSummary.map((carrier) => {
    const laneShare =
      totalAwardedLanes > 0 ? carrier.laneCount / totalAwardedLanes : 0;

    const savingsPercent =
      carrier.historicalSpend > 0
        ? carrier.estimatedSavings / carrier.historicalSpend
        : 0;

    return [
      "carrier_summary",
      rfp.name ?? "RFP",
      carrier.carrierName,
      carrier.laneCount,
      laneShare,
      carrier.shipmentCount,
      carrier.historicalSpend,
      carrier.awardedCost,
      carrier.estimatedSavings,
      savingsPercent,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ];
  });

  const detailRows = awardedRows.map((row) => [
    "lane_detail",
    rfp.name ?? "RFP",
    row.carrierName,
    "",
    "",
    row.shipmentCount,
    row.historicalSpend,
    row.awardedCost,
    row.estimatedSavings,
    row.historicalSpend > 0 ? row.estimatedSavings / row.historicalSpend : 0,
    row.lane.id ?? "",
    row.lane.lane_state_pair ?? "",
    row.lane.origin_city ?? "",
    row.lane.origin_state ?? "",
    row.lane.origin_zip ?? "",
    row.lane.destination_city ?? "",
    row.lane.destination_state ?? "",
    row.lane.destination_zip ?? "",
    row.award.award_status ?? "",
    row.award.backup_carrier_name ?? "",
    row.award.third_carrier_name ?? "",
    row.award.notes ?? ""
  ]);

  const csv = [
    headers.map(csvEscape).join(","),
    ...summaryRows.map((row) => row.map(csvEscape).join(",")),
    ...detailRows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-award-summary.csv"`,
    },
  });
}