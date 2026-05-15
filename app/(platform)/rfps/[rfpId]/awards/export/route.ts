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
      .eq("rfp_id", rfpId)
      .order("lane_state_pair", { ascending: true }),

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

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => awardsByLane.set(String(award.lane_id), award));

  const headers = [
    "rfp_name",
    "lane_id",
    "lane_state_pair",
    "origin_city",
    "origin_state",
    "origin_zip",
    "destination_city",
    "destination_state",
    "destination_zip",
    "shipment_count",
    "historical_spend",
    "current_carrier",
    "award_status",
    "primary_carrier",
    "primary_cost",
    "backup_carrier",
    "backup_cost",
    "third_carrier",
    "third_cost",
    "estimated_savings",
    "award_notes",
    "updated_at"
  ];

  const rows = lanes.map((lane) => {
    const award = awardsByLane.get(String(lane.id)) ?? null;

    const primaryCost = moneyNumber(award?.primary_estimated_cost);
    const historicalSpend = moneyNumber(lane.historical_spend);
    const estimatedSavings =
      award?.primary_estimated_cost !== null &&
      award?.primary_estimated_cost !== undefined
        ? historicalSpend - primaryCost
        : "";

    return [
      rfp.name ?? "RFP",
      lane.id ?? "",
      lane.lane_state_pair ?? "",
      lane.origin_city ?? "",
      lane.origin_state ?? "",
      lane.origin_zip ?? "",
      lane.destination_city ?? "",
      lane.destination_state ?? "",
      lane.destination_zip ?? "",
      lane.shipment_count ?? "",
      lane.historical_spend ?? "",
      lane.current_carrier ?? "",
      award?.award_status ?? "",
      award?.primary_carrier_name ?? "",
      award?.primary_estimated_cost ?? "",
      award?.backup_carrier_name ?? "",
      award?.backup_estimated_cost ?? "",
      award?.third_carrier_name ?? "",
      award?.third_estimated_cost ?? "",
      estimatedSavings,
      award?.notes ?? "",
      award?.updated_at ?? ""
    ];
  });

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-award-decisions.csv"`,
    },
  });
}