import { notFound } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/supabase";

function csvEscape(value: string | number | null | undefined) {
  const raw = String(value ?? "");
  return `"${raw.replaceAll('"', '""')}"`;
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

  const { data: lanes, error: lanesError } = await supabase
    .from("shipment_lanes")
    .select(`
      id,
      origin_city,
      origin_state,
      origin_zip,
      destination_city,
      destination_state,
      destination_zip,
      lane_state_pair,
      weight,
      weight_break,
      freight_class,
      shipment_count
    `)
    .eq("rfp_id", invite.rfp_id)
    .order("lane_state_pair", { ascending: true });

  if (lanesError) {
    throw new Error(lanesError.message);
  }

  const headers = [
    "lane_id",
    "origin_city",
    "origin_state",
    "origin_zip",
    "destination_city",
    "destination_state",
    "destination_zip",
    "lane_state_pair",
    "weight",
    "weight_break",
    "freight_class",
    "shipment_count",
    "discount",
    "minimum_charge",
    "rate_per_lb",
    "accessorial_charge",
    "transit_days",
    "carrier_notes"
  ];

  const rows = (lanes ?? []).map((lane: any) => [
    lane.id,
    lane.origin_city,
    lane.origin_state,
    lane.origin_zip,
    lane.destination_city,
    lane.destination_state,
    lane.destination_zip,
    lane.lane_state_pair,
    lane.weight,
    lane.weight_break,
    lane.freight_class,
    lane.shipment_count,
    "",
    "",
    "",
    "",
    "",
    ""
  ]);

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="carrier-bid-template.csv"`,
    },
  });
}