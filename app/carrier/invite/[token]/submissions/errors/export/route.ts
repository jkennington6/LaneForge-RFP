import { notFound } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/supabase";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createServiceSupabaseClient();

  const { data: invite, error: inviteError } = await supabase
    .from("rfp_carrier_invites")
    .select(`
      id,
      rfp_id,
      carrier_name,
      contact_email,
      invite_token,
      rfps (
        id,
        name
      )
    `)
    .eq("invite_token", token)
    .single();

  if (inviteError || !invite) {
    notFound();
  }

  const rfp = Array.isArray(invite.rfps) ? invite.rfps[0] : invite.rfps;

  if (!rfp) {
    notFound();
  }

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
      created_at
    `)
    .eq("invite_id", invite.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const headers = [
    "rfp_name",
    "carrier_name",
    "csv_row_number",
    "error_type",
    "error_message",
    "raw_row_json",
    "logged_at"
  ];

  const rows = (data ?? []).map((validationError: AnyRow) => [
    rfp.name ?? "RFP",
    invite.carrier_name ?? "",
    validationError.row_number ?? "",
    validationError.error_type ?? "",
    validationError.error_message ?? "",
    JSON.stringify(validationError.raw_row ?? {}),
    validationError.created_at ?? ""
  ]);

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-upload-errors.csv"`,
    },
  });
}