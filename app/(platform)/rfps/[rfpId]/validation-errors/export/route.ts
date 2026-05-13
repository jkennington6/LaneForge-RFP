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

function getSubmission(error: AnyRow) {
  return Array.isArray(error.carrier_bid_submissions)
    ? error.carrier_bid_submissions[0]
    : error.carrier_bid_submissions;
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

  const { data, error } = await supabase
    .from("carrier_bid_validation_errors")
    .select(`
      id,
      submission_id,
      rfp_id,
      invite_id,
      row_number,
      error_type,
      error_message,
      raw_row,
      created_at,
      carrier_bid_submissions (
        carrier_name,
        original_filename,
        status
      )
    `)
    .eq("rfp_id", rfpId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const headers = [
    "rfp_name",
    "carrier_name",
    "original_filename",
    "submission_status",
    "csv_row_number",
    "error_type",
    "error_message",
    "raw_row_json",
    "logged_at"
  ];

  const rows = (data ?? []).map((validationError: AnyRow) => {
    const submission = getSubmission(validationError);

    return [
      rfp.name ?? "RFP",
      submission?.carrier_name ?? "",
      submission?.original_filename ?? "",
      submission?.status ?? "",
      validationError.row_number ?? "",
      validationError.error_type ?? "",
      validationError.error_message ?? "",
      JSON.stringify(validationError.raw_row ?? {}),
      validationError.created_at ?? ""
    ];
  });

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-validation-errors.csv"`,
    },
  });
}