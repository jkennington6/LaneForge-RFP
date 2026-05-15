import { requireRfpExportAccess } from "@/lib/rfp-access";

type AnyRow = Record<string, any>;

type CheckStatus = "pass" | "warn" | "fail";

type ReadinessCheck = {
  category: string;
  title: string;
  detail: string;
  status: CheckStatus;
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

function moneyNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return moneyNumber(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
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

  const [
    lanesResult,
    invitesResult,
    submissionsResult,
    validationErrorsResult,
    awardsResult,
    releaseResult,
  ] = await Promise.all([
    supabase.from("shipment_lanes").select("*").eq("rfp_id", rfpId),
    supabase.from("rfp_carrier_invites").select("id, status").eq("rfp_id", rfpId),
    supabase.from("carrier_bid_submissions").select("id, status, is_active").eq("rfp_id", rfpId),
    supabase.from("carrier_bid_validation_errors").select("id").eq("rfp_id", rfpId),
    supabase.from("rfp_lane_awards").select("*").eq("rfp_id", rfpId),
    supabase.from("rfp_customer_release_settings").select("*").eq("rfp_id", rfpId).maybeSingle(),
  ]);

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (invitesResult.error) throw new Error(invitesResult.error.message);
  if (submissionsResult.error) throw new Error(submissionsResult.error.message);
  if (validationErrorsResult.error) throw new Error(validationErrorsResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);
  if (releaseResult.error) throw new Error(releaseResult.error.message);

  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const invites = (invitesResult.data ?? []) as AnyRow[];
  const submissions = (submissionsResult.data ?? []) as AnyRow[];
  const validationErrors = (validationErrorsResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];
  const releaseSettings = releaseResult.data as AnyRow | null;

  const activeSubmissions = submissions.filter((submission) => submission.is_active);
  const submittedInvites = invites.filter((invite) =>
    String(invite.status ?? "").toLowerCase().includes("submitted")
  );

  const awardedLaneIds = new Set(
    awards
      .filter((award) => award.primary_rate_id || award.primary_carrier_name)
      .map((award) => String(award.lane_id))
  );

  const totalHistoricalSpend = lanes.reduce(
    (sum, lane) => sum + moneyNumber(lane.historical_spend),
    0
  );

  const totalAwardedCost = awards.reduce(
    (sum, award) => sum + moneyNumber(award.primary_estimated_cost),
    0
  );

  const releasedAnything = Boolean(
    releaseSettings?.show_carrier_names ||
      releaseSettings?.show_bid_amounts ||
      releaseSettings?.show_savings ||
      releaseSettings?.show_comparisons ||
      releaseSettings?.show_routing_guide ||
      releaseSettings?.show_award_recommendation
  );

  const checks: ReadinessCheck[] = [
    {
      category: "RFP Setup",
      title: "Shipment lanes loaded",
      detail:
        lanes.length > 0
          ? `${lanes.length} shipment lane(s) are loaded.`
          : "No shipment lanes are loaded.",
      status: lanes.length > 0 ? "pass" : "fail",
    },
    {
      category: "Carrier Participation",
      title: "Carrier invites created",
      detail:
        invites.length > 0
          ? `${invites.length} carrier invite(s) exist.`
          : "No carrier invites exist yet.",
      status: invites.length > 0 ? "pass" : "fail",
    },
    {
      category: "Carrier Participation",
      title: "Carrier bids received",
      detail:
        activeSubmissions.length > 0
          ? `${activeSubmissions.length} active carrier bid submission(s) are available.`
          : "No active carrier bid submissions are available.",
      status: activeSubmissions.length > 0 ? "pass" : "fail",
    },
    {
      category: "Bid Quality",
      title: "Bid validation errors",
      detail:
        validationErrors.length === 0
          ? "No validation errors are currently logged."
          : `${validationErrors.length} validation error(s) are logged.`,
      status: validationErrors.length === 0 ? "pass" : "warn",
    },
    {
      category: "Bid Quality",
      title: "Submitted invite coverage",
      detail:
        invites.length > 0
          ? `${submittedInvites.length} of ${invites.length} invite(s) have submitted or submitted-with-errors status.`
          : "No invites available to measure submitted coverage.",
      status:
        invites.length === 0
          ? "fail"
          : submittedInvites.length === invites.length
            ? "pass"
            : submittedInvites.length > 0
              ? "warn"
              : "fail",
    },
    {
      category: "Awarding",
      title: "Formal awards generated",
      detail:
        awardedLaneIds.size > 0
          ? `${awardedLaneIds.size} of ${lanes.length} lane(s) have a primary award.`
          : "No formal lane awards are saved yet.",
      status:
        lanes.length > 0 && awardedLaneIds.size === lanes.length
          ? "pass"
          : awardedLaneIds.size > 0
            ? "warn"
            : "fail",
    },
    {
      category: "Awarding",
      title: "Award cost summary",
      detail:
        totalAwardedCost > 0
          ? `Awarded cost is ${money(totalAwardedCost)} versus historical spend of ${money(totalHistoricalSpend)}.`
          : "Awarded cost is not available yet.",
      status: totalAwardedCost > 0 ? "pass" : "warn",
    },
    {
      category: "Customer Release",
      title: "Release settings exist",
      detail: releaseSettings
        ? "Customer release settings are configured."
        : "Customer release settings have not been configured yet.",
      status: releaseSettings ? "pass" : "warn",
    },
    {
      category: "Customer Release",
      title: "Customer visibility controlled",
      detail: releasedAnything
        ? "At least one customer-facing visibility option is enabled."
        : "Customer-facing visibility is currently locked down.",
      status: releasedAnything ? "warn" : "pass",
    },
    {
      category: "Customer Release",
      title: "Awards released only after awards exist",
      detail:
        releaseSettings?.show_award_recommendation && awardedLaneIds.size === 0
          ? "Award recommendations are released, but no formal awards exist."
          : "Award release setting is consistent with current award data.",
      status:
        releaseSettings?.show_award_recommendation && awardedLaneIds.size === 0
          ? "fail"
          : "pass",
    },
  ];

  const passCount = checks.filter((check) => check.status === "pass").length;
  const readinessScore = Math.round((passCount / checks.length) * 100);

  const headers = [
    "rfp_name",
    "readiness_score",
    "status",
    "category",
    "check",
    "details"
  ];

  const rows = checks.map((check) => [
    rfp.name ?? "RFP",
    `${readinessScore}%`,
    check.status,
    check.category,
    check.title,
    check.detail
  ]);

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-readiness-checklist.csv"`,
    },
  });
}