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

function rowBelongsToAnyOrg(row: AnyRow, orgIds: string[]) {
  if (!orgIds.length) return false;
  return Object.values(row).some((value) => orgIds.includes(String(value)));
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

function displayCarrierName(value: unknown, showCarrierNames: boolean) {
  if (!value) return "";
  return showCarrierNames ? String(value) : "Released carrier";
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
    supabase.from("rfps").select("*").eq("id", rfpId).is("deleted_at", null).maybeSingle(),
    supabase.from("rfp_customer_release_settings").select("*").eq("rfp_id", rfpId).maybeSingle(),
    supabase.from("shipment_lanes").select("*").eq("rfp_id", rfpId),
    supabase.from("rfp_lane_awards").select("*").eq("rfp_id", rfpId),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  const rfp = rfpResult.data as AnyRow;

  if (!rowBelongsToAnyOrg(rfp, customerOrgIds)) {
    notFound();
  }

  if (releaseResult.error) throw new Error(releaseResult.error.message);
  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);

  const release = releaseResult.data as AnyRow | null;

  const analyticsReleased = Boolean(
    release?.show_award_recommendation ||
      release?.show_comparisons ||
      release?.show_bid_amounts ||
      release?.show_savings
  );

  if (!analyticsReleased) {
    return new Response("Customer analytics have not been released.", { status: 403 });
  }

  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => awardsByLane.set(String(award.lane_id), award));

  const headers = [
    "rfp_name",
    "lane_id",
    "lane_state_pair",
    "origin_zip",
    "destination_zip",
    "shipment_count",
    "primary_carrier",
    "backup_carrier",
    "third_carrier",
    "award_status"
  ];

  if (release?.show_bid_amounts) {
    headers.push("awarded_cost");
  }

  if (release?.show_savings) {
    headers.push("historical_spend", "estimated_savings", "savings_percent");
  }

  const rows = lanes.map((lane) => {
    const award = awardsByLane.get(String(lane.id)) ?? null;

    const shipmentCount = numberValue(lane, ["shipment_count", "shipments", "count"]);
    const historicalSpend = numberValue(lane, [
      "historical_spend",
      "current_spend",
      "current_total",
      "total_spend",
      "spend",
    ]);

    const awardedCost =
      award?.primary_estimated_cost !== null &&
      award?.primary_estimated_cost !== undefined
        ? Number(award.primary_estimated_cost)
        : null;

    const savings = awardedCost !== null ? historicalSpend - awardedCost : null;
    const savingsPercent =
      savings !== null && historicalSpend > 0 ? savings / historicalSpend : "";

    const row: unknown[] = [
      rfp.name ?? "RFP",
      lane.id ?? "",
      lane.lane_state_pair ?? "",
      lane.origin_zip ?? "",
      lane.destination_zip ?? "",
      shipmentCount,
      displayCarrierName(award?.primary_carrier_name, Boolean(release?.show_carrier_names)),
      displayCarrierName(award?.backup_carrier_name, Boolean(release?.show_carrier_names)),
      displayCarrierName(award?.third_carrier_name, Boolean(release?.show_carrier_names)),
      award?.award_status ?? ""
    ];

    if (release?.show_bid_amounts) {
      row.push(awardedCost ?? "");
    }

    if (release?.show_savings) {
      row.push(historicalSpend, savings ?? "", savingsPercent);
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
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-customer-analytics.csv"`,
    },
  });
}