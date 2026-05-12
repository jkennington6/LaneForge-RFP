import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomerPortalUser, getCustomerOrgIdsForCurrentUser } from "@/lib/portal-access";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

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

function text(row: AnyRow | null | undefined, keys: string[], fallback = "—") {
  const value = pick(row, keys);
  return value === null ? fallback : String(value);
}

function numberValue(row: AnyRow | null | undefined, keys: string[], fallback = 0) {
  const value = pick(row, keys);
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value: number) {
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

  return zipLane ? `${stateLane} · ${zipLane}` : stateLane;
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

  const { data: laneRows } = await supabase
    .from("manual_bid_lines")
    .select("*")
    .eq("rfp_id", rfpId);

  const { data: inviteRows } = await supabase
    .from("rfp_carrier_invites")
    .select("*")
    .eq("rfp_id", rfpId);

  const lanes = (laneRows ?? []) as AnyRow[];
  const invites = (inviteRows ?? []) as AnyRow[];

  const title = text(rfpRow, ["name", "title", "rfp_name"], "Untitled RFP");
  const status = text(rfpRow, ["status", "rfp_status"], "Unknown");
  const type = text(rfpRow, ["type", "rfp_type", "transportation_mode", "mode"], "RFP");
  const dueDate = pick(rfpRow, ["due_date", "bid_due_date", "deadline", "bid_deadline"]);
  const instructions = text(rfpRow, ["carrier_instructions", "instructions", "carrier_notes"], "No carrier instructions have been posted yet.");
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
  ]);

  const submittedCount = invites.filter((invite) => {
    const inviteStatus = text(invite, ["status", "invite_status", "response_status"], "").toLowerCase();

    return (
      inviteStatus.includes("submitted") ||
      inviteStatus.includes("complete") ||
      inviteStatus.includes("received")
    );
  }).length;

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
            {type} · Due date: {formatDate(dueDate)}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950">
        <strong>Customer visibility:</strong> this page shows the RFP package released to your organization.
        Carrier bid amounts, savings, comparisons, routing guides, and award recommendations are hidden unless
        explicitly released by the managing organization.
      </div>

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
                Carrier names are hidden in the customer view unless released.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Responses received</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">
                {submittedCount} / {invites.length}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Bid amounts remain hidden until released.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Savings and award recommendations are not shown here by default. They should only be shown from an approved
            customer-facing summary.
          </div>
        </section>
      </div>

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
                      <td className="px-4 py-3 text-slate-600">{origin || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{destination || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {text(lane, ["weight", "shipment_weight", "avg_weight"], "—")}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {text(lane, ["class", "freight_class", "actual_class", "rated_class"], "—")}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {text(lane, ["shipment_count", "shipments", "historical_shipments", "count"], "1")}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {money(numberValue(lane, ["historical_spend", "current_spend", "current_total", "total_spend", "spend"]))}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {money(numberValue(lane, ["accessorial_spend", "accessorial_total", "accessorial_cost"]))}
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