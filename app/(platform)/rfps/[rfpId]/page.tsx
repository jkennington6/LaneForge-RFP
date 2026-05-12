import Link from "next/link";
import { notFound } from "next/navigation";
import {
  requireCustomerPortalUser,
  getCustomerOrgIdsForCurrentUser,
} from "@/lib/portal-access";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

type ReleaseSettings = {
  show_carrier_names: boolean;
  show_bid_amounts: boolean;
  show_savings: boolean;
  show_comparisons: boolean;
  show_routing_guide: boolean;
  show_award_recommendation: boolean;
  release_notes: string | null;
};

type RankedRate = AnyRow & {
  carrier_name: string;
  estimated_cost: number | null;
};

const defaultReleaseSettings: ReleaseSettings = {
  show_carrier_names: false,
  show_bid_amounts: false,
  show_savings: false,
  show_comparisons: false,
  show_routing_guide: false,
  show_award_recommendation: false,
  release_notes: null,
};

function pick(row: AnyRow | null | undefined, keys: string[]) {
  if (!row) return null;

  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
}

function text(row: AnyRow | null | undefined, keys: string[], fallback = "-") {
  const value = pick(row, keys);
  return value === null ? fallback : String(value);
}

function numberValue(row: AnyRow | null | undefined, keys: string[], fallback = 0) {
  const value = pick(row, keys);
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: unknown) {
  if (!value) return "Not set";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function rowBelongsToAnyOrg(row: AnyRow, orgIds: string[]) {
  if (!orgIds.length) return false;

  return Object.values(row).some((value) => orgIds.includes(String(value)));
}

function sumRows(rows: AnyRow[], keys: string[]) {
  return rows.reduce((sum, row) => sum + numberValue(row, keys), 0);
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("active") || normalized.includes("open")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalized.includes("draft")) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  if (normalized.includes("closed") || normalized.includes("complete")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function laneName(lane: AnyRow) {
  const originState = text(lane, ["origin_state", "origin_province"], "");
  const destState = text(lane, ["destination_state", "dest_state", "destination_province"], "");
  const originZip = text(lane, ["origin_zip", "origin_postal_code"], "");
  const destZip = text(lane, ["destination_zip", "dest_zip", "destination_postal_code"], "");

  const stateLane = originState && destState ? `${originState}-${destState}` : "Lane";
  const zipLane = originZip && destZip ? `${originZip}-${destZip}` : "";

  return zipLane ? `${stateLane} - ${zipLane}` : stateLane;
}

function getCarrierName(rate: AnyRow) {
  const submission = rate.carrier_bid_submissions;

  if (Array.isArray(submission)) {
    return text(submission[0] as AnyRow, ["carrier_name"], "Unknown Carrier");
  }

  if (submission && typeof submission === "object") {
    return text(submission as AnyRow, ["carrier_name"], "Unknown Carrier");
  }

  return "Unknown Carrier";
}

function matchesLane(rate: AnyRow, lane: AnyRow) {
  const rateLaneId = text(rate, ["lane_id"], "");
  const laneId = text(lane, ["id"], "");

  if (rateLaneId && laneId && rateLaneId === laneId) return true;

  const rateOriginZip = text(rate, ["origin_zip"], "");
  const laneOriginZip = text(lane, ["origin_zip", "origin_postal_code"], "");

  const rateDestZip = text(rate, ["destination_zip", "dest_zip"], "");
  const laneDestZip = text(lane, ["destination_zip", "dest_zip", "destination_postal_code"], "");

  const rateWeightBreak = text(rate, ["weight_break"], "");
  const laneWeightBreak = text(lane, ["weight_break"], "");

  const rateClass = text(rate, ["freight_class", "class"], "");
  const laneClass = text(lane, ["freight_class", "class", "actual_class", "rated_class"], "");

  const zipMatch =
    rateOriginZip &&
    laneOriginZip &&
    rateDestZip &&
    laneDestZip &&
    rateOriginZip === laneOriginZip &&
    rateDestZip === laneDestZip;

  const weightBreakMatch = !rateWeightBreak || !laneWeightBreak || rateWeightBreak === laneWeightBreak;
  const classMatch = !rateClass || !laneClass || rateClass === laneClass;

  return Boolean(zipMatch && weightBreakMatch && classMatch);
}

function calculateEstimatedCost(rate: AnyRow, lane: AnyRow) {
  const weight = numberValue(lane, ["weight", "shipment_weight", "avg_weight"], 0);
  const shipmentCount = numberValue(lane, ["shipment_count", "shipments", "historical_shipments", "count"], 1);
  const ratePerLb = nullableNumber(rate.rate_per_lb);
  const minimumCharge = nullableNumber(rate.minimum_charge);
  const accessorialCharge = nullableNumber(rate.accessorial_charge) ?? 0;

  let shipmentCost: number | null = null;

  if (ratePerLb !== null && weight > 0) {
    shipmentCost = ratePerLb * weight;
  }

  if (minimumCharge !== null) {
    shipmentCost = shipmentCost === null ? minimumCharge : Math.max(shipmentCost, minimumCharge);
  }

  if (shipmentCost === null) return null;

  return (shipmentCost + accessorialCharge) * shipmentCount;
}

function buildComparisonRows(lanes: AnyRow[], rates: AnyRow[]) {
  return lanes.map((lane) => {
    const rankedRates: RankedRate[] = rates
      .filter((rate) => matchesLane(rate, lane))
      .map((rate) => ({
        ...rate,
        carrier_name: getCarrierName(rate),
        estimated_cost: calculateEstimatedCost(rate, lane),
      }))
      .filter((rate) => rate.estimated_cost !== null)
      .sort((a, b) => Number(a.estimated_cost) - Number(b.estimated_cost));

    const primary = rankedRates[0] ?? null;
    const backup = rankedRates[1] ?? null;
    const third = rankedRates[2] ?? null;

    const historicalSpend = numberValue(lane, [
      "historical_spend",
      "current_spend",
      "current_total",
      "total_spend",
      "spend",
    ]);

    const savings =
      primary?.estimated_cost !== null && primary?.estimated_cost !== undefined
        ? historicalSpend - primary.estimated_cost
        : null;

    return {
      lane,
      rankedRates,
      primary,
      backup,
      third,
      savings,
    };
  });
}

export default async function CustomerRfpDetailPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;

  const user = await requireCustomerPortalUser();
  const customerOrgIds = (await getCustomerOrgIdsForCurrentUser(user)) ?? [];

  if (!customerOrgIds.length) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold text-slate-950">Customer RFP</h1>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Your account is active, but it has not been linked to a customer organization yet.
          Contact the Super Admin to complete setup.
        </div>
      </main>
    );
  }

  const supabase = createServiceSupabaseClient();

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .select("*")
    .eq("id", rfpId)
    .is("deleted_at", null)
    .maybeSingle();

  if (rfpError) {
    throw new Error(rfpError.message);
  }

  if (!rfp) {
    notFound();
  }

  const rfpRow = rfp as AnyRow;

  if (!rowBelongsToAnyOrg(rfpRow, customerOrgIds)) {
    notFound();
  }

  const [
    laneResult,
    inviteResult,
    releaseResult,
    rateResult,
  ] = await Promise.all([
    supabase
      .from("shipment_lanes")
      .select("*")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_carrier_invites")
      .select("*")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_customer_release_settings")
      .select(
        "show_carrier_names, show_bid_amounts, show_savings, show_comparisons, show_routing_guide, show_award_recommendation, release_notes"
      )
      .eq("rfp_id", rfpId)
      .maybeSingle(),

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

  if (laneResult.error) {
    throw new Error(laneResult.error.message);
  }

  if (inviteResult.error) {
    throw new Error(inviteResult.error.message);
  }

  if (releaseResult.error) {
    throw new Error(releaseResult.error.message);
  }

  if (rateResult.error) {
    throw new Error(rateResult.error.message);
  }

  const lanes = (laneResult.data ?? []) as AnyRow[];
  const invites = (inviteResult.data ?? []) as AnyRow[];
  const releaseSettings: ReleaseSettings = {
    ...defaultReleaseSettings,
    ...((releaseResult.data ?? {}) as Partial<ReleaseSettings>),
  };
  const rates = (rateResult.data ?? []) as AnyRow[];

  const comparisonRows = buildComparisonRows(lanes, rates);
  const rowsWithAward = comparisonRows.filter((row) => row.primary);
  const rowsWithSavings = comparisonRows.filter((row) => row.savings !== null);

  const title = text(rfpRow, ["name", "title", "rfp_name"], "Untitled RFP");
  const status = text(rfpRow, ["status", "rfp_status"], "Unknown");
  const type = text(rfpRow, ["type", "rfp_type", "transportation_mode", "mode"], "RFP");
  const dueDate = pick(rfpRow, ["due_date", "bid_due_date", "deadline", "bid_deadline"]);
  const instructions = text(
    rfpRow,
    ["carrier_instructions", "instructions", "carrier_notes"],
    "No carrier instructions have been posted yet."
  );
  const fuelAssumptions = text(rfpRow, ["fuel_assumptions", "fuel", "fsc_assumptions"], "Not provided");
  const accessorialAssumptions = text(rfpRow, ["accessorial_assumptions", "accessorials"], "Not provided");

  const shipmentCount =
    sumRows(lanes, ["shipment_count", "shipments", "historical_shipments", "count"]) || lanes.length;

  const historicalSpend = sumRows(lanes, [
    "historical_spend",
    "current_spend",
    "current_total",
    "total_spend",
    "spend",
  ]);

  const accessorialSpend = sumRows(lanes, [
    "accessorial_spend",
    "accessorial_total",
    "accessorial_cost",
    "accessorials",
  ]);

  const submittedCount = invites.filter((invite) => {
    const inviteStatus = text(invite, ["status", "invite_status", "response_status"], "").toLowerCase();

    return (
      inviteStatus.includes("submitted") ||
      inviteStatus.includes("complete") ||
      inviteStatus.includes("received")
    );
  }).length;

  const estimatedAwardCost = comparisonRows.reduce((sum, row) => {
    if (!row.primary?.estimated_cost) return sum;
    return sum + row.primary.estimated_cost;
  }, 0);

  const estimatedSavings = estimatedAwardCost > 0 ? historicalSpend - estimatedAwardCost : null;

  return (
    <main className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/customer/rfps" className="text-sm font-semibold text-slate-600 hover:text-slate-950">
            Back to customer RFPs
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-950">{title}</h1>

            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(status)}`}>
              {status}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-600">
            {type} - Due date: {formatDate(dueDate)}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
        <strong>Customer visibility:</strong> this page shows the RFP package released to your organization.
        Carrier bid amounts, savings, comparisons, routing guides, and award recommendations are controlled by
        the managing organization.
      </div>

      {releaseSettings.release_notes && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
          <strong className="text-slate-950">Release notes:</strong> {releaseSettings.release_notes}
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Shipment lanes</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{lanes.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Shipments represented</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{shipmentCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Historical spend</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{money(historicalSpend)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Accessorial spend</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{money(accessorialSpend)}</p>
        </div>
      </div>

      {(releaseSettings.show_savings || releaseSettings.show_award_recommendation) && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-emerald-700">Estimated award cost</p>
            <p className="mt-2 text-2xl font-bold text-emerald-950">
              {releaseSettings.show_bid_amounts ? money(estimatedAwardCost || null) : "Released"}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-emerald-700">Estimated savings</p>
            <p className="mt-2 text-2xl font-bold text-emerald-950">
              {releaseSettings.show_savings ? money(estimatedSavings) : "Hidden"}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-emerald-700">Awarded lanes</p>
            <p className="mt-2 text-2xl font-bold text-emerald-950">{rowsWithAward.length}</p>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">RFP package</h2>

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="font-medium text-slate-700">Carrier instructions</p>
              <p className="mt-1 leading-6 text-slate-600">{instructions}</p>
            </div>

            <div>
              <p className="font-medium text-slate-700">Fuel assumptions</p>
              <p className="mt-1 leading-6 text-slate-600">{fuelAssumptions}</p>
            </div>

            <div>
              <p className="font-medium text-slate-700">Accessorial assumptions</p>
              <p className="mt-1 leading-6 text-slate-600">{accessorialAssumptions}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Bid activity</h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Carrier invitations</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{invites.length}</p>
              <p className="mt-1 text-xs text-slate-500">
                {releaseSettings.show_carrier_names
                  ? "Carrier names are released."
                  : "Carrier names are hidden in the customer view unless released."}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Responses received</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">
                {submittedCount} / {invites.length}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {releaseSettings.show_bid_amounts
                  ? "Bid amount visibility is released."
                  : "Bid amounts remain hidden until released."}
              </p>
            </div>
          </div>

          {!releaseSettings.show_savings && !releaseSettings.show_award_recommendation && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Savings and award recommendations are not currently released.
            </div>
          )}

          {releaseSettings.show_carrier_names && invites.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-950">Participating carriers</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                {invites.map((invite, index) => (
                  <div key={String(invite.id ?? index)} className="flex justify-between gap-4">
                    <span>{text(invite, ["carrier_name"], "Carrier")}</span>
                    <span className="text-slate-500">{text(invite, ["status"], "-")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {releaseSettings.show_routing_guide && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-4">
            <h2 className="font-semibold text-emerald-950">Released routing guide</h2>
            <p className="mt-1 text-sm text-emerald-800">
              Primary, backup, and tertiary carrier recommendations released by the managing organization.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Lane</th>
                  <th className="px-4 py-3">Primary</th>
                  <th className="px-4 py-3">Backup</th>
                  <th className="px-4 py-3">Third</th>
                  {releaseSettings.show_bid_amounts && <th className="px-4 py-3">Award cost</th>}
                  {releaseSettings.show_savings && <th className="px-4 py-3">Savings</th>}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {comparisonRows.slice(0, 50).map((row, index) => (
                  <tr key={String(row.lane.id ?? index)}>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {laneName(row.lane)}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {releaseSettings.show_carrier_names ? row.primary?.carrier_name ?? "-" : row.primary ? "Released carrier" : "-"}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {releaseSettings.show_carrier_names ? row.backup?.carrier_name ?? "-" : row.backup ? "Released carrier" : "-"}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {releaseSettings.show_carrier_names ? row.third?.carrier_name ?? "-" : row.third ? "Released carrier" : "-"}
                    </td>

                    {releaseSettings.show_bid_amounts && (
                      <td className="px-4 py-3 text-slate-600">
                        {money(row.primary?.estimated_cost)}
                      </td>
                    )}

                    {releaseSettings.show_savings && (
                      <td className="px-4 py-3 text-slate-600">
                        {money(row.savings)}
                      </td>
                    )}
                  </tr>
                ))}

                {!comparisonRows.length && (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={6}>
                      No routing guide rows are available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {releaseSettings.show_comparisons && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-purple-200 bg-white shadow-sm">
          <div className="border-b border-purple-200 bg-purple-50 px-5 py-4">
            <h2 className="font-semibold text-purple-950">Released comparison summary</h2>
            <p className="mt-1 text-sm text-purple-800">
              Customer-facing comparison output released by the managing organization.
            </p>
          </div>

          <div className="p-5 text-sm text-slate-700">
            {rowsWithSavings.length} lane(s) have comparison-ready pricing. Full comparison detail can be expanded in the next build step.
          </div>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Shipment lanes</h2>
          <p className="mt-1 text-sm text-slate-600">
            Customer-safe shipment details connected to this RFP.
          </p>
        </div>

        {lanes.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Lane</th>
                  <th className="px-4 py-3">Origin</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">Weight</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Shipments</th>
                  <th className="px-4 py-3">Historical spend</th>
                  <th className="px-4 py-3">Accessorial spend</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {lanes.slice(0, 50).map((lane, index) => {
                  const origin = [
                    text(lane, ["origin_city"], ""),
                    text(lane, ["origin_state", "origin_province"], ""),
                    text(lane, ["origin_zip", "origin_postal_code"], ""),
                  ].filter(Boolean).join(", ");

                  const destination = [
                    text(lane, ["destination_city", "dest_city"], ""),
                    text(lane, ["destination_state", "dest_state", "destination_province"], ""),
                    text(lane, ["destination_zip", "dest_zip", "destination_postal_code"], ""),
                  ].filter(Boolean).join(", ");

                  return (
                    <tr key={String(lane.id ?? index)}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{laneName(lane)}</td>
                      <td className="px-4 py-3 text-slate-600">{origin || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{destination || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {text(lane, ["weight", "shipment_weight", "avg_weight"], "-")}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {text(lane, ["class", "freight_class", "actual_class", "rated_class"], "-")}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {text(lane, ["shipment_count", "shipments", "historical_shipments", "count"], "1")}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {money(numberValue(lane, ["historical_spend", "current_spend", "current_total", "total_spend", "spend"]))}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {money(numberValue(lane, ["accessorial_spend", "accessorial_total", "accessorial_cost", "accessorials"]))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {lanes.length > 50 && (
              <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
                Showing first 50 lanes of {lanes.length}. Full export view can be added next.
              </div>
            )}
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-600">
            No shipment lanes have been loaded for this RFP yet.
          </div>
        )}
      </section>
    </main>
  );
}