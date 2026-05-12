import { notFound } from "next/navigation";
import { requireRfpExportAccess } from "@/lib/rfp-access";

function csvEscape(value: unknown) {
  const raw = String(value ?? "");
  return `"${raw.replaceAll('"', '""')}"`;
}

function moneyNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCarrierName(rate: any) {
  const submission = Array.isArray(rate.carrier_bid_submissions)
    ? rate.carrier_bid_submissions[0]
    : rate.carrier_bid_submissions;

  return submission?.carrier_name ?? "Unknown Carrier";
}

function matchesLane(rate: any, lane: any) {
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

function calculateEstimatedCost(rate: any, lane: any) {
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

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
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

  const [rfpResult, lanesResult, ratesResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, mode, status")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .single(),

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

  if (lanesResult.error) {
    throw new Error(lanesResult.error.message);
  }

  if (ratesResult.error) {
    throw new Error(ratesResult.error.message);
  }

  const rfp = rfpResult.data;
  const lanes = lanesResult.data ?? [];
  const rates = ratesResult.data ?? [];

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
    "weight",
    "weight_break",
    "freight_class",
    "shipment_count",
    "historical_spend",
    "current_carrier",
    "rank",
    "carrier_name",
    "estimated_cost",
    "estimated_savings",
    "discount",
    "minimum_charge",
    "rate_per_lb",
    "accessorial_charge",
    "transit_days",
    "carrier_notes"
  ];

  const outputRows: unknown[][] = [];

  for (const lane of lanes) {
    const matchingRates = rates
      .filter((rate: any) => matchesLane(rate, lane))
      .map((rate: any) => ({
        ...rate,
        carrier_name: getCarrierName(rate),
        estimated_cost: calculateEstimatedCost(rate, lane),
      }))
      .sort((a: any, b: any) => {
        if (a.estimated_cost === null && b.estimated_cost === null) return 0;
        if (a.estimated_cost === null) return 1;
        if (b.estimated_cost === null) return -1;
        return a.estimated_cost - b.estimated_cost;
      });

    if (!matchingRates.length) {
      outputRows.push([
        rfp.name,
        lane.id,
        lane.lane_state_pair,
        lane.origin_city,
        lane.origin_state,
        lane.origin_zip,
        lane.destination_city,
        lane.destination_state,
        lane.destination_zip,
        lane.weight,
        lane.weight_break,
        lane.freight_class,
        lane.shipment_count,
        lane.historical_spend,
        lane.current_carrier,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ]);

      continue;
    }

    matchingRates.forEach((rate: any, index: number) => {
      const estimatedSavings =
        rate.estimated_cost !== null && rate.estimated_cost !== undefined
          ? moneyNumber(lane.historical_spend) - rate.estimated_cost
          : "";

      outputRows.push([
        rfp.name,
        lane.id,
        lane.lane_state_pair,
        lane.origin_city,
        lane.origin_state,
        lane.origin_zip,
        lane.destination_city,
        lane.destination_state,
        lane.destination_zip,
        lane.weight,
        lane.weight_break,
        lane.freight_class,
        lane.shipment_count,
        lane.historical_spend,
        lane.current_carrier,
        rate.estimated_cost === null ? "" : index + 1,
        rate.carrier_name,
        rate.estimated_cost ?? "",
        estimatedSavings,
        rate.discount ?? "",
        rate.minimum_charge ?? "",
        rate.rate_per_lb ?? "",
        rate.accessorial_charge ?? "",
        rate.transit_days ?? "",
        rate.notes ?? ""
      ]);
    });
  }

  const csv = [
    headers.map(csvEscape).join(","),
    ...outputRows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(rfp.name)}-bid-comparisons.csv"`,
    },
  });
}