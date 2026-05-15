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

  const [lanesResult, awardsResult, invitesResult, submissionsResult, validationErrorsResult] =
    await Promise.all([
      supabase.from("shipment_lanes").select("*").eq("rfp_id", rfpId),
      supabase.from("rfp_lane_awards").select("*").eq("rfp_id", rfpId),
      supabase.from("rfp_carrier_invites").select("id, carrier_name, status").eq("rfp_id", rfpId),
      supabase.from("carrier_bid_submissions").select("id, carrier_name, status, is_active").eq("rfp_id", rfpId),
      supabase.from("carrier_bid_validation_errors").select("id, error_type").eq("rfp_id", rfpId),
    ]);

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);
  if (invitesResult.error) throw new Error(invitesResult.error.message);
  if (submissionsResult.error) throw new Error(submissionsResult.error.message);
  if (validationErrorsResult.error) throw new Error(validationErrorsResult.error.message);

  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];
  const invites = (invitesResult.data ?? []) as AnyRow[];
  const submissions = (submissionsResult.data ?? []) as AnyRow[];
  const validationErrors = (validationErrorsResult.data ?? []) as AnyRow[];

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
    const savingsPercent =
      savings !== null && historicalSpend > 0 ? savings / historicalSpend : null;

    return {
      lane,
      award,
      shipmentCount,
      historicalSpend,
      awardedCost,
      savings,
      savingsPercent,
    };
  });

  const awardedRows = laneRows.filter(
    (row) => row.award?.primary_carrier_name && row.awardedCost !== null
  );

  const totalHistoricalSpend = laneRows.reduce((sum, row) => sum + row.historicalSpend, 0);
  const totalAwardedCost = awardedRows.reduce((sum, row) => sum + Number(row.awardedCost ?? 0), 0);
  const totalSavings = totalHistoricalSpend - totalAwardedCost;
  const totalSavingsPercent = totalHistoricalSpend > 0 ? totalSavings / totalHistoricalSpend : 0;

  const carrierSummary = new Map<string, AnyRow>();

  awardedRows.forEach((row) => {
    const carrierName = String(row.award?.primary_carrier_name ?? "Unassigned");

    const existing =
      carrierSummary.get(carrierName) ??
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

    carrierSummary.set(carrierName, existing);
  });

  const statePairSummary = new Map<string, AnyRow>();

  laneRows.forEach((row) => {
    const laneStatePair = String(row.lane.lane_state_pair ?? "Unknown");

    const existing =
      statePairSummary.get(laneStatePair) ??
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

    statePairSummary.set(laneStatePair, existing);
  });

  const headers = [
    "row_type",
    "rfp_name",
    "metric",
    "value",
    "carrier_name",
    "lane_state_pair",
    "lane_id",
    "origin_zip",
    "destination_zip",
    "shipment_count",
    "historical_spend",
    "awarded_cost",
    "estimated_savings",
    "savings_percent",
    "primary_carrier",
    "backup_carrier",
    "third_carrier",
    "award_status"
  ];

  const summaryRows = [
    ["executive_summary", rfp.name ?? "RFP", "total_lanes", lanes.length, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["executive_summary", rfp.name ?? "RFP", "awarded_lanes", awardedRows.length, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["executive_summary", rfp.name ?? "RFP", "unawarded_lanes", Math.max(0, lanes.length - awardedRows.length), "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["executive_summary", rfp.name ?? "RFP", "historical_spend", totalHistoricalSpend, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["executive_summary", rfp.name ?? "RFP", "awarded_cost", totalAwardedCost, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["executive_summary", rfp.name ?? "RFP", "estimated_savings", totalSavings, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["executive_summary", rfp.name ?? "RFP", "savings_percent", totalSavingsPercent, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["executive_summary", rfp.name ?? "RFP", "invited_carriers", invites.length, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["executive_summary", rfp.name ?? "RFP", "active_bid_submissions", submissions.filter((submission) => submission.is_active).length, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["executive_summary", rfp.name ?? "RFP", "validation_errors", validationErrors.length, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ];

  const carrierRows = Array.from(carrierSummary.values()).map((carrier) => [
    "carrier_summary",
    rfp.name ?? "RFP",
    "",
    "",
    carrier.carrierName,
    "",
    "",
    "",
    "",
    carrier.shipmentCount,
    carrier.historicalSpend,
    carrier.awardedCost,
    carrier.savings,
    carrier.historicalSpend > 0 ? carrier.savings / carrier.historicalSpend : 0,
    "",
    "",
    "",
    ""
  ]);

  const statePairRows = Array.from(statePairSummary.values()).map((statePair) => [
    "state_pair_summary",
    rfp.name ?? "RFP",
    "",
    "",
    "",
    statePair.laneStatePair,
    "",
    "",
    "",
    statePair.shipmentCount,
    statePair.historicalSpend,
    statePair.awardedCost,
    statePair.savings,
    statePair.historicalSpend > 0 ? statePair.savings / statePair.historicalSpend : 0,
    "",
    "",
    "",
    ""
  ]);

  const detailRows = laneRows.map((row) => [
    "lane_detail",
    rfp.name ?? "RFP",
    "",
    "",
    "",
    row.lane.lane_state_pair ?? "",
    row.lane.id ?? "",
    row.lane.origin_zip ?? "",
    row.lane.destination_zip ?? "",
    row.shipmentCount,
    row.historicalSpend,
    row.awardedCost ?? "",
    row.savings ?? "",
    row.savingsPercent ?? "",
    row.award?.primary_carrier_name ?? "",
    row.award?.backup_carrier_name ?? "",
    row.award?.third_carrier_name ?? "",
    row.award?.award_status ?? ""
  ]);

  const csv = [
    headers.map(csvEscape).join(","),
    ...summaryRows.map((row) => row.map(csvEscape).join(",")),
    ...carrierRows.map((row) => row.map(csvEscape).join(",")),
    ...statePairRows.map((row) => row.map(csvEscape).join(",")),
    ...detailRows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-analytics.csv"`,
    },
  });
}