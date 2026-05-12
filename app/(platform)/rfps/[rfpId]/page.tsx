import Link from "next/link";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { notFound, redirect } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { RfpInvitesAndMessages } from "@/components/rfp-invites-and-messages";
type RfpRow = {
  id: string;
  customer_id: string;
  name: string;
  mode: "LTL" | "FTL" | "BOTH";
  status: "draft" | "active" | "closed" | "archived";
  bid_due_date: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  carrier_instructions: string | null;
  accessorial_assumptions: string | null;
  fuel_assumptions: string | null;
  required_pricing_format: string | null;
};

type LaneRow = {
  id: string;
  origin_city: string | null;
  origin_state: string | null;
  origin_zip: string | null;
  destination_city: string | null;
  destination_state: string | null;
  destination_zip: string | null;
  lane_state_pair: string | null;
  weight: number | null;
  weight_break: string | null;
  freight_class: string | null;
  shipment_count: number;
  historical_spend: number | null;
  accessorials: number | null;
  current_carrier: string | null;
};

function cleanZip(value: string) {
  return value.replace(/\D/g, "").slice(0, 5);
}

function zip3(value: string) {
  const cleaned = cleanZip(value);
  return cleaned.length >= 3 ? cleaned.slice(0, 3) : null;
}

function toNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

function getWeightBreak(weight: number | null) {
  if (!weight) return null;
  if (weight <= 150) return "0-150";
  if (weight <= 250) return "151-250";
  if (weight <= 500) return "251-500";
  if (weight <= 1000) return "501-1000";
  if (weight <= 2000) return "1001-2000";
  if (weight <= 5000) return "2001-5000";
  if (weight <= 10000) return "5001-10000";
  return "10000+";
}

function formatDate(value: string | null) {
  if (!value) return "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â";
  return new Date(value).toLocaleDateString();
}

function money(value: number | null) {
  if (value === null || value === undefined) return "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â";

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

async function createLane(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const laneId = randomUUID();
  const rfpId = String(formData.get("rfp_id") ?? "").trim();

  const originCity = String(formData.get("origin_city") ?? "").trim();
  const originState = String(formData.get("origin_state") ?? "").trim().toUpperCase();
  const originZip = cleanZip(String(formData.get("origin_zip") ?? ""));

  const destinationCity = String(formData.get("destination_city") ?? "").trim();
  const destinationState = String(formData.get("destination_state") ?? "").trim().toUpperCase();
  const destinationZip = cleanZip(String(formData.get("destination_zip") ?? ""));

  const weight = toNumber(formData.get("weight"));
  const freightClass = String(formData.get("freight_class") ?? "").trim();
  const shipmentCount = toNumber(formData.get("shipment_count")) ?? 1;
  const historicalSpend = toNumber(formData.get("historical_spend"));
  const accessorials = toNumber(formData.get("accessorials"));
  const currentCarrier = String(formData.get("current_carrier") ?? "").trim();

  if (!rfpId) {
    throw new Error("RFP ID is required.");
  }

  if (!originState || !destinationState) {
    throw new Error("Origin state and destination state are required.");
  }

  const { error } = await supabase.from("shipment_lanes").insert({
    id: laneId,
    rfp_id: rfpId,
    origin_zip: originZip || null,
    origin_zip3: zip3(originZip),
    origin_city: originCity || null,
    origin_state: originState,
    destination_zip: destinationZip || null,
    destination_zip3: zip3(destinationZip),
    destination_city: destinationCity || null,
    destination_state: destinationState,
    lane_state_pair: `${originState}-${destinationState}`,
    weight,
    weight_break: getWeightBreak(weight),
    freight_class: freightClass || null,
    shipment_count: shipmentCount,
    historical_spend: historicalSpend,
    accessorials,
    current_carrier: currentCarrier || null,
    validation_status: "valid",
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/rfps/${rfpId}`);
  revalidatePath("/rfps");
  revalidatePath("/dashboard");
  revalidatePath("/comparisons");
  revalidatePath("/routing-guides");
}


async function deleteRfp(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();
  const rfpId = String(formData.get("rfp_id") ?? "").trim();

  if (!rfpId) {
    throw new Error("RFP ID is required.");
  }

  const { data: responses, error: responsesError } = await supabase
    .from("bid_responses")
    .select("id")
    .eq("rfp_id", rfpId);

  if (responsesError && !responsesError.message.toLowerCase().includes("does not exist")) {
    throw new Error(responsesError.message);
  }

  const responseIds = ((responses ?? []) as { id: string }[]).map((row) => row.id);

  if (responseIds.length) {
    const { error: responseLinesError } = await supabase
      .from("bid_response_lines")
      .delete()
      .in("bid_response_id", responseIds);

    if (responseLinesError && !responseLinesError.message.toLowerCase().includes("does not exist")) {
      throw new Error(responseLinesError.message);
    }
  }

  const relatedDeletes = [
    { table: "bid_messages", column: "rfp_id" },
    { table: "rfp_carrier_invites", column: "rfp_id" },
    { table: "bid_responses", column: "rfp_id" },
    { table: "shipment_lanes", column: "rfp_id" },
    { table: "rfp_customer_visibility", column: "rfp_id" },
  ];

  for (const relatedDelete of relatedDeletes) {
    const { error } = await supabase
      .from(relatedDelete.table)
      .delete()
      .eq(relatedDelete.column, rfpId);

    if (error && !error.message.toLowerCase().includes("does not exist")) {
      throw new Error(error.message);
    }
  }

  const { error } = await supabase.from("rfps").delete().eq("id", rfpId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/rfps");
  revalidatePath("/dashboard");
  revalidatePath("/comparisons");
  revalidatePath("/routing-guides");

  redirect("/rfps");
}
export default async function RfpDetailPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, lanesResult] = await Promise.all([
    supabase
      .from("rfps")
      .select(
        "id, customer_id, name, mode, status, bid_due_date, effective_date, expiration_date, carrier_instructions, accessorial_assumptions, fuel_assumptions, required_pricing_format"
      )
      .eq("id", rfpId)
      .single(),

    supabase
      .from("shipment_lanes")
      .select(
        "id, origin_city, origin_state, origin_zip, destination_city, destination_state, destination_zip, lane_state_pair, weight, weight_break, freight_class, shipment_count, historical_spend, accessorials, current_carrier"
      )
      .eq("rfp_id", rfpId)
      .order("lane_state_pair", { ascending: true }),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  const rfp = rfpResult.data as RfpRow;
  const lanes = (lanesResult.data ?? []) as LaneRow[];

  const totalShipments = lanes.reduce(
    (sum, lane) => sum + Number(lane.shipment_count ?? 0),
    0
  );

  const totalSpend = lanes.reduce(
    (sum, lane) => sum + Number(lane.historical_spend ?? 0),
    0
  );

  const totalAccessorials = lanes.reduce(
    (sum, lane) => sum + Number(lane.accessorials ?? 0),
    0
  );

  return (
    <div>
      <SectionHeader
        title={rfp.name}
        description={`${rfp.mode} RFP ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ ${rfp.status} ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Bid due ${formatDate(rfp.bid_due_date)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/rfps"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Back to RFPs
            </Link>
            <Link
  href={`/rfps/${rfpId}/invites`}
  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
>
  Invite carriers
</Link>
<form action={deleteRfp}>
  <input type="hidden" name="rfp_id" value={rfp.id} />
  <ConfirmSubmitButton
    confirmMessage={`Delete ${rfp.name}? This will permanently remove this RFP and related lanes, invites, messages, and bids.`}
    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
  >
    Delete RFP
  </ConfirmSubmitButton>
</form>
</div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Lanes</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{lanes.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Shipments</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{totalShipments}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Historical Spend</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{money(totalSpend)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Accessorial Spend</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{money(totalAccessorials)}</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Carrier Instructions</h2>
          <p className="mt-2 text-sm text-slate-600">
            {rfp.carrier_instructions ?? "No carrier instructions entered."}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Pricing Assumptions</h2>
          <p className="mt-2 text-sm text-slate-600">
            Format: {rfp.required_pricing_format ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Fuel: {rfp.fuel_assumptions ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Accessorials: {rfp.accessorial_assumptions ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}
          </p>
        </div>
      </div>

      <form
        action={createLane}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <input type="hidden" name="rfp_id" value={rfp.id} />

        <h2 className="text-lg font-semibold text-slate-950">Add shipment lane</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Origin city
            <input name="origin_city" placeholder="Atlanta" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Origin state
            <input name="origin_state" required maxLength={2} placeholder="GA" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Origin ZIP
            <input name="origin_zip" placeholder="30301" maxLength={5} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Destination city
            <input name="destination_city" placeholder="Miami" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Destination state
            <input name="destination_state" required maxLength={2} placeholder="FL" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Destination ZIP
            <input name="destination_zip" placeholder="33101" maxLength={5} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Weight
            <input name="weight" type="number" step="1" placeholder="750" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Class
            <input name="freight_class" placeholder="92.5" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Shipment count
            <input name="shipment_count" type="number" step="1" defaultValue="1" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Historical spend
            <input name="historical_spend" type="number" step="0.01" placeholder="6200" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Accessorial spend
            <input name="accessorials" type="number" step="0.01" placeholder="450" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Current carrier
            <input name="current_carrier" placeholder="Saia" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>

        <button
          type="submit"
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Add lane
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Origin</th>
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Weight</th>
              <th className="px-4 py-3">Break</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Shipments</th>
              <th className="px-4 py-3">Spend</th>
              <th className="px-4 py-3">Carrier</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {lanes.map((lane) => (
              <tr key={lane.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {lane.lane_state_pair ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {lane.origin_city ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}, {lane.origin_state ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"} {lane.origin_zip ?? ""}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {lane.destination_city ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}, {lane.destination_state ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"} {lane.destination_zip ?? ""}
                </td>
                <td className="px-4 py-3 text-slate-600">{lane.weight ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}</td>
                <td className="px-4 py-3 text-slate-600">{lane.weight_break ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}</td>
                <td className="px-4 py-3 text-slate-600">{lane.freight_class ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}</td>
                <td className="px-4 py-3 text-slate-600">{lane.shipment_count}</td>
                <td className="px-4 py-3 text-slate-600">{money(lane.historical_spend)}</td>
                <td className="px-4 py-3 text-slate-600">{lane.current_carrier ?? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"}</td>
              </tr>
            ))}

            {!lanes.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={9}>
                  No shipment lanes have been added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

