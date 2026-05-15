import { notFound } from "next/navigation";
import {
  requireCustomerPortalUser,
  getCustomerOrgIdsForCurrentUser,
} from "@/lib/portal-access";
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

function moneyNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowBelongsToAnyOrg(row: AnyRow, orgIds: string[]) {
  if (!orgIds.length) return false;
  return Object.values(row).some((value) => orgIds.includes(String(value)));
}

function releasedCarrierName(value: unknown, released: boolean) {
  if (!value) return "";
  return released ? String(value) : "Released carrier";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rfpId: string }> }
) {
  const { rfpId } = await params;

  const user = await requireCustomerPortalUser();
  const customerOrgIds = (await getCustomerOrgIdsForCurrentUser(user)) ?? [];

  if (!customerOrgIds.length) {
    return new Response("Customer organization not linked.", { status: 403 });
  }

  const supabase = createServiceSupabaseClient();

  const [rfpResult, releaseResult, lanesResult, awardsResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("*")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .maybeSingle(),

    supabase
      .from("rfp_customer_release_settings")
      .select("*")
      .eq("rfp_id", rfpId)
      .maybeSingle(),

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

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  const rfp = rfpResult.data as AnyRow;

  if (!rowBelongsToAnyOrg(rfp, customerOrgIds)) {
    notFound();
  }

  if (releaseResult.error) {
    throw new Error(releaseResult.error.message);
  }

  const release = releaseResult.data as AnyRow | null;

  if (!release?.show_award_recommendation) {
    return new Response("Award recommendations have not been released.", { status: 403 });
  }

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
    "award_status",
    "primary_carrier",
    "backup_carrier",
    "third_carrier"
  ];

  if (release.show_bid_amounts) {
    headers.push("primary_cost", "backup_cost", "third_cost");
  }

  if (release.show_savings) {
    headers.push("estimated_savings");
  }

  const rows = lanes.map((lane) => {
    const award = awardsByLane.get(String(lane.id)) ?? null;

    const row: unknown[] = [
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
      award?.award_status ?? "",
      releasedCarrierName(award?.primary_carrier_name, release.show_carrier_names),
      releasedCarrierName(award?.backup_carrier_name, release.show_carrier_names),
      releasedCarrierName(award?.third_carrier_name, release.show_carrier_names),
    ];

    if (release.show_bid_amounts) {
      row.push(
        award?.primary_estimated_cost ?? "",
        award?.backup_estimated_cost ?? "",
        award?.third_estimated_cost ?? ""
      );
    }

    if (release.show_savings) {
      const primaryCost = moneyNumber(award?.primary_estimated_cost);
      const historicalSpend = moneyNumber(lane.historical_spend);

      row.push(
        award?.primary_estimated_cost !== null &&
        award?.primary_estimated_cost !== undefined
          ? historicalSpend - primaryCost
          : ""
      );
    }

    return row;
  });

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-released-award-recommendations.csv"`,
    },
  });
}