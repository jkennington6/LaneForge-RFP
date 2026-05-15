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

function yesNo(value: unknown) {
  return Boolean(value) ? "Yes" : "No";
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
    .from("rfp_customer_release_events")
    .select("*")
    .eq("rfp_id", rfpId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const headers = [
    "rfp_name",
    "created_at",
    "action",
    "preset",
    "show_carrier_names",
    "show_bid_amounts",
    "show_savings",
    "show_comparisons",
    "show_routing_guide",
    "show_award_recommendation",
    "release_notes",
    "created_by_clerk_user_id",
    "settings_snapshot_json"
  ];

  const rows = ((data ?? []) as AnyRow[]).map((event) => {
    const snapshot = (event.settings_snapshot ?? {}) as AnyRow;

    return [
      rfp.name ?? "RFP",
      event.created_at ?? "",
      event.action ?? "",
      event.preset ?? "",
      yesNo(snapshot.show_carrier_names),
      yesNo(snapshot.show_bid_amounts),
      yesNo(snapshot.show_savings),
      yesNo(snapshot.show_comparisons),
      yesNo(snapshot.show_routing_guide),
      yesNo(snapshot.show_award_recommendation),
      snapshot.release_notes ?? event.notes ?? "",
      event.created_by_clerk_user_id ?? "",
      JSON.stringify(snapshot)
    ];
  });

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-customer-release-history.csv"`,
    },
  });
}