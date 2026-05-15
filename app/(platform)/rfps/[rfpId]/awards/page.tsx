import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function moneyNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCarrierName(rate: AnyRow) {
  const submission = Array.isArray(rate.carrier_bid_submissions)
    ? rate.carrier_bid_submissions[0]
    : rate.carrier_bid_submissions;

  return submission?.carrier_name ?? "Unknown Carrier";
}

function isActiveRate(rate: AnyRow) {
  const submission = Array.isArray(rate.carrier_bid_submissions)
    ? rate.carrier_bid_submissions[0]
    : rate.carrier_bid_submissions;

  return submission?.is_active !== false;
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

function laneLabel(lane: AnyRow) {
  const statePair = lane.lane_state_pair ?? "Lane";
  const origin = lane.origin_zip ?? "-";
  const destination = lane.destination_zip ?? "-";

  return `${statePair} - ${origin} to ${destination}`;
}

function rateOptionLabel(rate: AnyRow) {
  return `${rate.carrier_name} - ${money(rate.estimated_cost)} - Min ${money(rate.minimum_charge)} - Rate/LB ${money(rate.rate_per_lb)}`;
}

async function saveLaneAward(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") ?? "").trim();
  const laneId = String(formData.get("lane_id") ?? "").trim();

  const primaryRateId = String(formData.get("primary_rate_id") ?? "").trim() || null;
  const backupRateId = String(formData.get("backup_rate_id") ?? "").trim() || null;
  const thirdRateId = String(formData.get("third_rate_id") ?? "").trim() || null;

  const awardStatus = String(formData.get("award_status") ?? "draft").trim() || "draft";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!rfpId || !laneId) {
    throw new Error("RFP ID and lane ID are required.");
  }

  const { data: lane, error: laneError } = await supabase
    .from("shipment_lanes")
    .select("*")
    .eq("id", laneId)
    .eq("rfp_id", rfpId)
    .single();

  if (laneError || !lane) {
    throw new Error(laneError?.message ?? "Lane not found.");
  }

  const selectedRateIds = [primaryRateId, backupRateId, thirdRateId].filter(Boolean) as string[];

  let selectedRates: AnyRow[] = [];

  if (selectedRateIds.length > 0) {
    const { data: rates, error: ratesError } = await supabase
      .from("carrier_bid_lane_rates")
      .select(`
        *,
        carrier_bid_submissions (
          carrier_name,
          is_active
        )
      `)
      .eq("rfp_id", rfpId)
      .in("id", selectedRateIds);

    if (ratesError) {
      throw new Error(ratesError.message);
    }

    selectedRates = (rates ?? [])
      .filter(isActiveRate)
      .map((rate) => ({
        ...rate,
        carrier_name: getCarrierName(rate),
        estimated_cost: calculateEstimatedCost(rate, lane),
      }));
  }

  function findRate(rateId: string | null) {
    if (!rateId) return null;
    return selectedRates.find((rate) => rate.id === rateId) ?? null;
  }

  const primary = findRate(primaryRateId);
  const backup = findRate(backupRateId);
  const third = findRate(thirdRateId);

  const payload = {
    rfp_id: rfpId,
    lane_id: laneId,

    primary_rate_id: primary?.id ?? null,
    backup_rate_id: backup?.id ?? null,
    third_rate_id: third?.id ?? null,

    primary_carrier_name: primary?.carrier_name ?? null,
    backup_carrier_name: backup?.carrier_name ?? null,
    third_carrier_name: third?.carrier_name ?? null,

    primary_estimated_cost: primary?.estimated_cost ?? null,
    backup_estimated_cost: backup?.estimated_cost ?? null,
    third_estimated_cost: third?.estimated_cost ?? null,

    award_status: awardStatus,
    notes,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("rfp_lane_awards")
    .upsert(payload, {
      onConflict: "rfp_id,lane_id",
    });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  revalidatePath(`/rfps/${rfpId}/awards`);
  revalidatePath(`/rfps/${rfpId}/routing-guide`);
  revalidatePath(`/rfps/${rfpId}/customer-release`);
}

export default async function RfpAwardsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, lanesResult, ratesResult, awardsResult] = await Promise.all([
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
          is_active
        )
      `)
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_lane_awards")
      .select("*")
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

  if (awardsResult.error) {
    throw new Error(awardsResult.error.message);
  }

  const rfp = rfpResult.data;
  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const rates = ((ratesResult.data ?? []) as AnyRow[]).filter(isActiveRate);
  const awards = (awardsResult.data ?? []) as AnyRow[];

  const awardsByLane = new Map<string, AnyRow>();
  awards.forEach((award) => awardsByLane.set(String(award.lane_id), award));

  const awardRows = lanes.map((lane) => {
    const rankedRates: AnyRow[] = rates
      .filter((rate) => matchesLane(rate, lane))
      .map((rate) => ({
        ...rate,
        carrier_name: getCarrierName(rate),
        estimated_cost: calculateEstimatedCost(rate, lane),
      }))
      .filter((rate) => rate.estimated_cost !== null)
      .sort((a, b) => Number(a.estimated_cost) - Number(b.estimated_cost));

    return {
      lane,
      rankedRates,
      award: awardsByLane.get(String(lane.id)) ?? null,
    };
  });

  const awardedLanes = awards.filter((award) => award.primary_rate_id).length;
  const totalAwardCost = awards.reduce(
    (sum, award) => sum + moneyNumber(award.primary_estimated_cost),
    0
  );

  return (
    <div>
      <SectionHeader
        title="Award Decisions"
        description={`${rfp.name} - convert draft routing recommendations into final lane awards`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}/routing-guide`}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Routing Guide
            </Link>

            <Link
              href={`/rfps/${rfp.id}/comparisons`}
              className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
            >
              Comparisons
            </Link>

            <Link
              href={`/rfps/${rfp.id}/awards/export`}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
            >
              Download Awards CSV
            </Link>

            <Link
              href={`/rfps/${rfp.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to RFP
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{lanes.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awarded Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{awardedLanes}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Unawarded Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{lanes.length - awardedLanes}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awarded Cost</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{money(totalAwardCost || null)}</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Lowest cost is only a recommendation. Use this page to apply final judgment, service requirements,
        customer preferences, carrier exclusions, and operational risk before releasing awards.
      </div>

      <div className="space-y-4">
        {awardRows.map(({ lane, rankedRates, award }) => (
          <form
            key={lane.id}
            action={saveLaneAward}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <input type="hidden" name="rfp_id" value={rfp.id} />
            <input type="hidden" name="lane_id" value={lane.id} />

            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-950">{laneLabel(lane)}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Shipments: {lane.shipment_count ?? "-"} - Historical Spend: {money(moneyNumber(lane.historical_spend))}
                </p>
              </div>

              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {rankedRates.length} priced option(s)
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <label className="block text-sm font-medium text-slate-700">
                Primary carrier
                <select
                  name="primary_rate_id"
                  defaultValue={award?.primary_rate_id ?? rankedRates[0]?.id ?? ""}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">No award</option>
                  {rankedRates.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rateOptionLabel(rate)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Backup carrier
                <select
                  name="backup_rate_id"
                  defaultValue={award?.backup_rate_id ?? rankedRates[1]?.id ?? ""}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">No backup</option>
                  {rankedRates.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rateOptionLabel(rate)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Third carrier
                <select
                  name="third_rate_id"
                  defaultValue={award?.third_rate_id ?? rankedRates[2]?.id ?? ""}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">No third option</option>
                  {rankedRates.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rateOptionLabel(rate)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Award status
                <select
                  name="award_status"
                  defaultValue={award?.award_status ?? "draft"}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="draft">Draft</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="approved">Approved</option>
                  <option value="released">Released</option>
                </select>
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Notes
              <textarea
                name="notes"
                defaultValue={award?.notes ?? ""}
                rows={2}
                placeholder="Optional award rationale, service notes, exclusions, or override explanation."
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <button
              type="submit"
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Save Award
            </button>
          </form>
        ))}

        {!awardRows.length && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            No shipment lanes are available for award decisions.
          </div>
        )}
      </div>
    </div>
  );
}