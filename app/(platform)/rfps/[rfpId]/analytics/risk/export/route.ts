import { requireRfpExportAccess } from "@/lib/rfp-access";

type AnyRow = Record<string, any>;

type RiskRow = {
  rowType: string;
  severity: string;
  category: string;
  laneId: string;
  laneName: string;
  detail: string;
  carrierOptions: number;
  historicalSpend: number;
  awardedCost: number | null;
  savings: number | null;
  primaryCarrier: string;
  errorType: string;
  errorMessage: string;
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

function getSubmission(rate: AnyRow) {
  return Array.isArray(rate.carrier_bid_submissions)
    ? rate.carrier_bid_submissions[0]
    : rate.carrier_bid_submissions;
}

function getCarrierName(rate: AnyRow) {
  const submission = getSubmission(rate);
  return String(submission?.carrier_name ?? rate.carrier_name ?? "Unknown Carrier");
}

function isActiveRate(rate: AnyRow) {
  const submission = getSubmission(rate);
  return submission?.is_active !== false;
}

function matchesLane(rate: AnyRow, lane: AnyRow) {
  if (rate.lane_id && lane.id && String(rate.lane_id) === String(lane.id)) return true;

  const originZipMatch =
    rate.origin_zip &&
    lane.origin_zip &&
    String(rate.origin_zip).trim() === String(lane.origin_zip).trim();

  const destinationZipMatch =
    rate.destination_zip &&
    lane.destination_zip &&
    String(rate.destination_zip).trim() === String(lane.destination_zip).trim();

  const weightBreakMatch =
    !rate.weight_break ||
    !lane.weight_break ||
    String(rate.weight_break).trim() === String(lane.weight_break).trim();

  const classMatch =
    !rate.freight_class ||
    !lane.freight_class ||
    String(rate.freight_class).trim() === String(lane.freight_class).trim();

  return Boolean(originZipMatch && destinationZipMatch && weightBreakMatch && classMatch);
}

function laneName(lane: AnyRow) {
  return `${lane.lane_state_pair ?? "Lane"} - ${lane.origin_zip ?? "-"} to ${lane.destination_zip ?? "-"}`;
}

function severityRank(severity: string) {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
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

  const [lanesResult, awardsResult, ratesResult, validationErrorsResult] =
    await Promise.all([
      supabase.from("shipment_lanes").select("*").eq("rfp_id", rfpId),
      supabase.from("rfp_lane_awards").select("*").eq("rfp_id", rfpId),

      supabase
        .from("carrier_bid_lane_rates")
        .select(`
          *,
          carrier_bid_submissions (
            carrier_name,
            is_active
          )
        `)
        .eq("rfp_id", rfpId),

      supabase
        .from("carrier_bid_validation_errors")
        .select("id, row_number, error_type, error_message")
        .eq("rfp_id", rfpId),
    ]);

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);
  if (ratesResult.error) throw new Error(ratesResult.error.message);
  if (validationErrorsResult.error) throw new Error(validationErrorsResult.error.message);

  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];
  const rates = ((ratesResult.data ?? []) as AnyRow[]).filter(isActiveRate);
  const validationErrors = (validationErrorsResult.data ?? []) as AnyRow[];

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => awardsByLane.set(String(award.lane_id), award));

  const riskRows: RiskRow[] = [];

  lanes.forEach((lane) => {
    const award = awardsByLane.get(String(lane.id)) ?? null;

    const matchingCarriers = new Set<string>();

    rates.forEach((rate) => {
      if (matchesLane(rate, lane)) {
        matchingCarriers.add(getCarrierName(rate));
      }
    });

    const carrierOptions = matchingCarriers.size;

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
    const primaryCarrier = String(award?.primary_carrier_name ?? "");

    const baseRow = {
      laneId: String(lane.id ?? ""),
      laneName: laneName(lane),
      carrierOptions,
      historicalSpend,
      awardedCost,
      savings,
      primaryCarrier,
      errorType: "",
      errorMessage: "",
    };

    if (!primaryCarrier) {
      riskRows.push({
        rowType: "risk",
        severity: "high",
        category: "Unawarded Lane",
        detail: "No primary award is saved for this lane.",
        ...baseRow,
      });
    }

    if (carrierOptions === 0) {
      riskRows.push({
        rowType: "risk",
        severity: "high",
        category: "No Bid Coverage",
        detail: "No active carrier bid appears to cover this lane.",
        ...baseRow,
      });
    }

    if (carrierOptions === 1) {
      riskRows.push({
        rowType: "risk",
        severity: "medium",
        category: "Single Carrier Option",
        detail: "Only one active carrier option appears available.",
        ...baseRow,
      });
    }

    if (savings !== null && savings < 0) {
      riskRows.push({
        rowType: "risk",
        severity: "medium",
        category: "Negative Savings",
        detail: "Awarded cost is higher than historical spend.",
        ...baseRow,
      });
    }

    if (historicalSpend === 0) {
      riskRows.push({
        rowType: "risk",
        severity: "low",
        category: "Missing Baseline Spend",
        detail: "Historical spend is missing or zero.",
        ...baseRow,
      });
    }

    if (savings !== null && savings > 0) {
      riskRows.push({
        rowType: "opportunity",
        severity: "low",
        category: "Savings Opportunity",
        detail: "Awarded cost is lower than historical spend.",
        ...baseRow,
      });
    }
  });

  validationErrors.forEach((error) => {
    riskRows.push({
      rowType: "validation_error",
      severity: "medium",
      category: "Bid Validation Error",
      laneId: "",
      laneName: "",
      detail: `Source row: ${error.row_number ?? ""}`,
      carrierOptions: 0,
      historicalSpend: 0,
      awardedCost: null,
      savings: null,
      primaryCarrier: "",
      errorType: String(error.error_type ?? ""),
      errorMessage: String(error.error_message ?? ""),
    });
  });

  const headers = [
    "rfp_name",
    "row_type",
    "severity",
    "category",
    "lane_id",
    "lane_name",
    "detail",
    "carrier_options",
    "historical_spend",
    "awarded_cost",
    "estimated_savings",
    "primary_carrier",
    "error_type",
    "error_message"
  ];

  const rows = riskRows
    .sort((a, b) => {
      const severityDifference = severityRank(b.severity) - severityRank(a.severity);
      if (severityDifference !== 0) return severityDifference;
      return Math.abs(Number(b.savings ?? 0)) - Math.abs(Number(a.savings ?? 0));
    })
    .map((row) => [
      rfp.name ?? "RFP",
      row.rowType,
      row.severity,
      row.category,
      row.laneId,
      row.laneName,
      row.detail,
      row.carrierOptions,
      row.historicalSpend,
      row.awardedCost ?? "",
      row.savings ?? "",
      row.primaryCarrier,
      row.errorType,
      row.errorMessage
    ]);

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-risk-opportunity-analytics.csv"`,
    },
  });
}