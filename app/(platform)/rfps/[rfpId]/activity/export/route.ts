import { requireRfpExportAccess } from "@/lib/rfp-access";

type AnyRow = Record<string, any>;

type ActivityRow = {
  timestamp: string;
  category: string;
  title: string;
  detail: string;
  status?: string | null;
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
    submissionsResult,
    validationErrorsResult,
    releaseEventsResult,
    awardsResult,
  ] = await Promise.all([
    supabase
      .from("carrier_bid_submissions")
      .select(
        "id, carrier_name, original_filename, status, submission_version, is_active, uploaded_at, processed_at"
      )
      .eq("rfp_id", rfpId),

    supabase
      .from("carrier_bid_validation_errors")
      .select("id, row_number, error_type, error_message, created_at")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_customer_release_events")
      .select("id, action, preset, notes, created_at")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_lane_awards")
      .select("id, lane_id, primary_carrier_name, award_status, created_at, updated_at")
      .eq("rfp_id", rfpId),
  ]);

  if (submissionsResult.error) {
    throw new Error(submissionsResult.error.message);
  }

  if (validationErrorsResult.error) {
    throw new Error(validationErrorsResult.error.message);
  }

  if (releaseEventsResult.error) {
    throw new Error(releaseEventsResult.error.message);
  }

  if (awardsResult.error) {
    throw new Error(awardsResult.error.message);
  }

  const submissions = (submissionsResult.data ?? []) as AnyRow[];
  const validationErrors = (validationErrorsResult.data ?? []) as AnyRow[];
  const releaseEvents = (releaseEventsResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];

  const activityRows: ActivityRow[] = [
    ...submissions.map((submission) => ({
      timestamp: submission.uploaded_at ?? submission.processed_at ?? "",
      category: "Bid Upload",
      title: `${submission.carrier_name ?? "Carrier"} uploaded bid v${submission.submission_version ?? 1}`,
      detail: `${submission.original_filename ?? "No filename"}${submission.is_active ? " - active submission" : " - superseded/inactive"}`,
      status: submission.status ?? null,
    })),

    ...validationErrors.map((error) => ({
      timestamp: error.created_at ?? "",
      category: "Validation",
      title: `Validation issue: ${error.error_type ?? "unknown"}`,
      detail: `CSV row ${error.row_number ?? "-"} - ${error.error_message ?? ""}`,
      status: "error",
    })),

    ...releaseEvents.map((event) => ({
      timestamp: event.created_at ?? "",
      category: "Customer Release",
      title:
        event.action === "preset_apply"
          ? `Release preset applied: ${event.preset ?? "unknown"}`
          : event.action === "restore_snapshot"
            ? "Customer release settings restored"
            : "Customer release settings saved",
      detail: event.notes ?? "-",
      status: event.action ?? null,
    })),

    ...awards.map((award) => ({
      timestamp: award.updated_at ?? award.created_at ?? "",
      category: "Award",
      title: award.primary_carrier_name
        ? `Lane awarded to ${award.primary_carrier_name}`
        : "Award decision updated",
      detail: `Lane ID: ${award.lane_id ?? "-"} - Status: ${award.award_status ?? "draft"}`,
      status: award.award_status ?? null,
    })),
  ].sort((a, b) => {
    const bTime = new Date(b.timestamp).getTime();
    const aTime = new Date(a.timestamp).getTime();

    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });

  const headers = [
    "rfp_name",
    "timestamp",
    "category",
    "activity",
    "details",
    "status"
  ];

  const rows = activityRows.map((activity) => [
    rfp.name ?? "RFP",
    activity.timestamp,
    activity.category,
    activity.title,
    activity.detail,
    activity.status ?? ""
  ]);

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-activity-timeline.csv"`,
    },
  });
}