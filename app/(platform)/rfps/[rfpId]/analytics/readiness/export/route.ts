import { requireRfpExportAccess } from "@/lib/rfp-access";

type AnyRow = Record<string, any>;

type ReadinessIssue = {
  severity: "high" | "medium" | "low";
  category: string;
  laneId: string;
  laneName: string;
  detail: string;
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

function laneName(lane: AnyRow) {
  return `${lane.lane_state_pair ?? "Lane"} - ${lane.origin_zip ?? "-"} to ${lane.destination_zip ?? "-"}`;
}

function severityRank(severity: "high" | "medium" | "low") {
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

  const [lanesResult, awardsResult, validationErrorsResult] = await Promise.all([
    supabase.from("shipment_lanes").select("*").eq("rfp_id", rfpId),
    supabase.from("rfp_lane_awards").select("*").eq("rfp_id", rfpId),
    supabase
      .from("carrier_bid_validation_errors")
      .select("id, error_type, error_message, row_number")
      .eq("rfp_id", rfpId),
  ]);

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);
  if (validationErrorsResult.error) throw new Error(validationErrorsResult.error.message);

  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];
  const validationErrors = (validationErrorsResult.data ?? []) as AnyRow[];

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => awardsByLane.set(String(award.lane_id), award));

  const issues: ReadinessIssue[] = [];

  let awardedLaneCount = 0;
  let negativeSavingsLaneCount = 0;
  let missingBaselineLaneCount = 0;
  let totalHistoricalSpend = 0;
  let totalAwardedCost = 0;

  lanes.forEach((lane) => {
    const award = awardsByLane.get(String(lane.id));

    const historicalSpend = numberValue(lane, [
      "historical_spend",
      "current_spend",
      "current_total",
      "total_spend",
      "spend",
    ]);

    totalHistoricalSpend += historicalSpend;

    const hasPrimaryCarrier = Boolean(String(award?.primary_carrier_name ?? "").trim());

    const awardedCost =
      award?.primary_estimated_cost !== null &&
      award?.primary_estimated_cost !== undefined
        ? Number(award.primary_estimated_cost)
        : null;

    if (hasPrimaryCarrier && awardedCost !== null) {
      awardedLaneCount += 1;
      totalAwardedCost += awardedCost;
    }

    if (!hasPrimaryCarrier) {
      issues.push({
        severity: "high",
        category: "Missing Primary Award",
        laneId: String(lane.id ?? ""),
        laneName: laneName(lane),
        detail: "No primary carrier is saved for this lane.",
      });
    }

    if (historicalSpend === 0) {
      missingBaselineLaneCount += 1;

      issues.push({
        severity: "medium",
        category: "Missing Baseline Spend",
        laneId: String(lane.id ?? ""),
        laneName: laneName(lane),
        detail: "Historical spend is zero or missing, so savings quality is limited.",
      });
    }

    if (awardedCost !== null && historicalSpend > 0 && awardedCost > historicalSpend) {
      negativeSavingsLaneCount += 1;

      issues.push({
        severity: "medium",
        category: "Cost Increase",
        laneId: String(lane.id ?? ""),
        laneName: laneName(lane),
        detail: `Awarded cost is higher than historical spend.`,
      });
    }
  });

  validationErrors.forEach((error) => {
    issues.push({
      severity: "medium",
      category: "Bid Validation Error",
      laneId: "",
      laneName: `Upload row ${error.row_number ?? "-"}`,
      detail: `${error.error_type ?? "Validation"}: ${error.error_message ?? "Review required"}`,
    });
  });

  const highIssueCount = issues.filter((issue) => issue.severity === "high").length;
  const mediumIssueCount = issues.filter((issue) => issue.severity === "medium").length;
  const lowIssueCount = issues.filter((issue) => issue.severity === "low").length;

  const issuePenalty =
    highIssueCount * 8 +
    mediumIssueCount * 3 +
    lowIssueCount * 1 +
    validationErrors.length * 2;

  const readinessScore = Math.max(0, Math.min(100, Math.round(100 - issuePenalty)));
  const awardCoverage = lanes.length > 0 ? awardedLaneCount / lanes.length : 0;
  const netSavings = totalHistoricalSpend - totalAwardedCost;
  const savingsPercent = totalHistoricalSpend > 0 ? netSavings / totalHistoricalSpend : 0;

  const summaryRows = [
    ["summary", rfp.name ?? "RFP", "", "Readiness Score", "", "", readinessScore],
    ["summary", rfp.name ?? "RFP", "", "Award Coverage", "", "", awardCoverage],
    ["summary", rfp.name ?? "RFP", "", "Awarded Lanes", "", "", awardedLaneCount],
    ["summary", rfp.name ?? "RFP", "", "Total Lanes", "", "", lanes.length],
    ["summary", rfp.name ?? "RFP", "", "High Issues", "", "", highIssueCount],
    ["summary", rfp.name ?? "RFP", "", "Medium Issues", "", "", mediumIssueCount],
    ["summary", rfp.name ?? "RFP", "", "Low Issues", "", "", lowIssueCount],
    ["summary", rfp.name ?? "RFP", "", "Validation Errors", "", "", validationErrors.length],
    ["summary", rfp.name ?? "RFP", "", "Missing Baseline Lanes", "", "", missingBaselineLaneCount],
    ["summary", rfp.name ?? "RFP", "", "Negative Savings Lanes", "", "", negativeSavingsLaneCount],
    ["summary", rfp.name ?? "RFP", "", "Net Savings", "", "", netSavings],
    ["summary", rfp.name ?? "RFP", "", "Savings Percent", "", "", savingsPercent],
  ];

  const issueRows = issues
    .sort((a, b) => {
      const severityDifference = severityRank(b.severity) - severityRank(a.severity);
      if (severityDifference !== 0) return severityDifference;
      return a.category.localeCompare(b.category);
    })
    .map((issue) => [
      "issue",
      rfp.name ?? "RFP",
      issue.severity,
      issue.category,
      issue.laneId,
      issue.laneName,
      issue.detail
    ]);

  const headers = [
    "row_type",
    "rfp_name",
    "severity",
    "category",
    "lane_id",
    "lane_or_row",
    "value_or_detail"
  ];

  const csv = [
    headers.map(csvEscape).join(","),
    ...summaryRows.map((row) => row.map(csvEscape).join(",")),
    ...issueRows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-award-readiness.csv"`,
    },
  });
}