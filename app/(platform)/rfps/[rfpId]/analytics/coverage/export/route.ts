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

  const [lanesResult, ratesResult, submissionsResult, invitesResult] = await Promise.all([
    supabase.from("shipment_lanes").select("*").eq("rfp_id", rfpId),

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

    supabase.from("carrier_bid_submissions").select("id, carrier_name, status, is_active").eq("rfp_id", rfpId),
    supabase.from("rfp_carrier_invites").select("id, carrier_name, status").eq("rfp_id", rfpId),
  ]);

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (ratesResult.error) throw new Error(ratesResult.error.message);
  if (submissionsResult.error) throw new Error(submissionsResult.error.message);
  if (invitesResult.error) throw new Error(invitesResult.error.message);

  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const rates = ((ratesResult.data ?? []) as AnyRow[]).filter(isActiveRate);
  const submissions = (submissionsResult.data ?? []) as AnyRow[];
  const invites = (invitesResult.data ?? []) as AnyRow[];

  const carrierNames = Array.from(
    new Set([
      ...invites.map((invite) => String(invite.carrier_name ?? "").trim()).filter(Boolean),
      ...submissions.map((submission) => String(submission.carrier_name ?? "").trim()).filter(Boolean),
      ...rates.map((rate) => getCarrierName(rate)).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const headers = [
    "row_type",
    "rfp_name",
    "carrier_name",
    "lane_state_pair",
    "lane_id",
    "lane_name",
    "total_lanes",
    "priced_lane_count",
    "carrier_options",
    "active_submission_count",
    "rate_row_count",
    "coverage_percent",
    "status",
    "carriers"
  ];

  const carrierRows = carrierNames.map((carrierName) => {
    const carrierRates = rates.filter((rate) => getCarrierName(rate) === carrierName);
    const carrierSubmissions = submissions.filter(
      (submission) => String(submission.carrier_name ?? "") === carrierName && submission.is_active
    );

    const pricedLaneIds = new Set<string>();

    lanes.forEach((lane) => {
      if (carrierRates.some((rate) => matchesLane(rate, lane))) {
        pricedLaneIds.add(String(lane.id));
      }
    });

    const coveragePercent = lanes.length > 0 ? pricedLaneIds.size / lanes.length : 0;

    const status =
      coveragePercent >= 0.9
        ? "Strong"
        : coveragePercent >= 0.5
          ? "Partial"
          : "Low";

    return [
      "carrier_summary",
      rfp.name ?? "RFP",
      carrierName,
      "",
      "",
      "",
      lanes.length,
      pricedLaneIds.size,
      "",
      carrierSubmissions.length,
      carrierRates.length,
      coveragePercent,
      status,
      ""
    ];
  });

  const laneRows = lanes.map((lane) => {
    const matchingRates = rates.filter((rate) => matchesLane(rate, lane));
    const matchingCarriers = Array.from(
      new Set(matchingRates.map((rate) => getCarrierName(rate)))
    ).sort((a, b) => a.localeCompare(b));

    return [
      "lane_detail",
      rfp.name ?? "RFP",
      "",
      lane.lane_state_pair ?? "",
      lane.id ?? "",
      laneName(lane),
      lanes.length,
      "",
      matchingCarriers.length,
      "",
      matchingRates.length,
      "",
      matchingCarriers.length === 0 ? "No Bid" : matchingCarriers.length === 1 ? "Single Carrier" : "Covered",
      matchingCarriers.join("; ")
    ];
  });

  const statePairMap = new Map<string, { laneCount: number; carrierOptionCount: number; rateRowCount: number }>();

  laneRows.forEach((row) => {
    const statePair = String(row[3] ?? "Unknown");
    const existing = statePairMap.get(statePair) ?? {
      laneCount: 0,
      carrierOptionCount: 0,
      rateRowCount: 0,
    };

    existing.laneCount += 1;
    existing.carrierOptionCount += Number(row[8] ?? 0);
    existing.rateRowCount += Number(row[10] ?? 0);

    statePairMap.set(statePair, existing);
  });

  const statePairRows = Array.from(statePairMap.entries()).map(([statePair, value]) => [
    "state_pair_summary",
    rfp.name ?? "RFP",
    "",
    statePair,
    "",
    "",
    value.laneCount,
    "",
    value.laneCount > 0 ? value.carrierOptionCount / value.laneCount : 0,
    "",
    value.rateRowCount,
    "",
    "",
    ""
  ]);

  const csv = [
    headers.map(csvEscape).join(","),
    ...carrierRows.map((row) => row.map(csvEscape).join(",")),
    ...statePairRows.map((row) => row.map(csvEscape).join(",")),
    ...laneRows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-coverage-analytics.csv"`,
    },
  });
}