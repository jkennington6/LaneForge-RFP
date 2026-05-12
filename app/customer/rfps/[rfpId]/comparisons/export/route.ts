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

function moneyNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function rowBelongsToAnyOrg(row: AnyRow, orgIds: string[]) {
  if (!orgIds.length) return false;
  return Object.values(row).some((value) => orgIds.includes(String(value)));
}

function getCarrierName(rate: AnyRow) {
  const submission = Array.isArray(rate.carrier_bid_submissions)
    ? rate.carrier_bid_submissions[0]
    : rate.carrier_bid_submissions;

  return submission?.carrier_name ?? "Released carrier";
}

function matchesLane(rate: AnyRow, lane: AnyRow) {
  if (rate.lane_id && rate.lane_id === lane.id) return true;

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

function calculateEstimatedCost(rate: AnyRow, lane: AnyRow) {
  const weight = moneyNumber(lane.weight);
  const shipmentCount = moneyNumber(lane.shipment_count || 1);
  const accessorial = moneyNumber(rate.accessorial_charge);

  let shipmentCost: number | null = null;

  if (rate.rate_per_lb !== null && rate.rate_per_lb !== undefined && weight > 0) {
    shipmentCost = moneyNumber(rate.rate_per_lb) * weight;
  }

  if (rate.minimum_charge !== null && rate.minimum_charge !== undefined) {
    const minimum = moneyNumber(rate.minimum_charge);
    shipmentCost = shipmentCost === null ? minimum : Math.max(shipmentCost, minimum);
  }

  if (shipmentCost === null) return null;

  return (shipmentCost + accessorial) * shipmentCount;
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

  const [rfpResult, releaseResult, lanesResult, ratesResult] = await Promise.all([
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
      .from("carrier_bid_lane_rates")
      .select(`
        *,
        carrier_bid_submissions (
          carrier_name,
          original_filename
        )
      `)
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

  if (!release?.show_comparisons) {
    return new Response("Comparison export has not been released.", { status: 403 });
  }

  if (lanesResult.error) {
    throw new Error(lanesResult.error.message);
  }

  if (ratesResult.error) {
    throw new Error(ratesResult.error.message);
  }

  const lanes = lanesResult.data ?? [];
  const rates = ratesResult.data ?? [];

  const headers = [
    "rfp_name",
    "lane_id",
    "lane_state_pair",
    "origin_zip",
    "destination_zip",
    "shipment_count",
    "historical_spend",
    "rank",
  ];

  if (release.show_carrier_names) {
    headers.push("carrier_name");
  }

  if (release.show_bid_amounts) {
    headers.push("estimated_cost", "minimum_charge", "rate_per_lb", "accessorial_charge");
  }

  if (release.show_savings) {
    headers.push("estimated_savings");
  }

  headers.push("transit_days");

  const outputRows: unknown[][] = [];

  for (const lane of lanes) {
    const rankedRates = rates
      .filter((rate: AnyRow) => matchesLane(rate, lane))
      .map((rate: AnyRow) => ({
        ...rate,
        carrier_name: release.show_carrier_names ? getCarrierName(rate) : "Released carrier",
        estimated_cost: calculateEstimatedCost(rate, lane),
      }))
      .filter((rate: AnyRow) => rate.estimated_cost !== null)
      .sort((a: AnyRow, b: AnyRow) => a.estimated_cost - b.estimated_cost);

    rankedRates.forEach((rate: AnyRow, index: number) => {
      const row: unknown[] = [
        rfp.name,
        lane.id,
        lane.lane_state_pair,
        lane.origin_zip,
        lane.destination_zip,
        lane.shipment_count,
        lane.historical_spend,
        index + 1,
      ];

      if (release.show_carrier_names) {
        row.push(rate.carrier_name);
      }

      if (release.show_bid_amounts) {
        row.push(
          rate.estimated_cost ?? "",
          rate.minimum_charge ?? "",
          rate.rate_per_lb ?? "",
          rate.accessorial_charge ?? ""
        );
      }

      if (release.show_savings) {
        row.push(
          rate.estimated_cost !== null && rate.estimated_cost !== undefined
            ? moneyNumber(lane.historical_spend) - rate.estimated_cost
            : ""
        );
      }

      row.push(rate.transit_days ?? "");

      outputRows.push(row);
    });
  }

  const csv = [
    headers.map(csvEscape).join(","),
    ...outputRows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(String(rfp.name ?? "rfp"))}-released-comparisons.csv"`,
    },
  });
}