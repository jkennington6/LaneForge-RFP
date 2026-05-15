import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { SectionHeader } from "@/components/section-header";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function formatDate(value: unknown) {
  if (!value) return "-";

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

function statusClass(status: unknown) {
  const normalized = String(status ?? "").toLowerCase();

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

async function createRfp(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const customerId = String(formData.get("customer_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const mode = String(formData.get("mode") ?? "LTL").trim();
  const status = String(formData.get("status") ?? "active").trim();
  const bidDueDate = String(formData.get("bid_due_date") ?? "").trim();
  const effectiveDate = String(formData.get("effective_date") ?? "").trim();
  const expirationDate = String(formData.get("expiration_date") ?? "").trim();
  const requiredPricingFormat = String(formData.get("required_pricing_format") ?? "").trim();
  const carrierInstructions = String(formData.get("carrier_instructions") ?? "").trim();
  const accessorialAssumptions = String(formData.get("accessorial_assumptions") ?? "").trim();
  const fuelAssumptions = String(formData.get("fuel_assumptions") ?? "").trim();
  const internalNotes = String(formData.get("internal_notes") ?? "").trim();

  if (!customerId) {
    throw new Error("Customer is required.");
  }

  if (!name) {
    throw new Error("RFP name is required.");
  }

  const { error } = await supabase.from("rfps").insert({
    id: crypto.randomUUID(),
    customer_id: customerId,
    name,
    mode,
    status,
    bid_due_date: bidDueDate || null,
    effective_date: effectiveDate || null,
    expiration_date: expirationDate || null,
    required_pricing_format: requiredPricingFormat || null,
    carrier_instructions: carrierInstructions || null,
    accessorial_assumptions: accessorialAssumptions || null,
    fuel_assumptions: fuelAssumptions || null,
    internal_notes: internalNotes || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/rfps");
  revalidatePath("/dashboard");
}

export default async function RfpsPage() {
  const supabase = createServiceSupabaseClient();

  const [rfpsResult, customersResult, organizationsResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, customer_id, name, mode, status, bid_due_date, effective_date, expiration_date, required_pricing_format, deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),

    supabase
      .from("customers")
      .select("id, organization_id, industry, mode_focus")
      .order("created_at", { ascending: false }),

    supabase
      .from("organizations")
      .select("id, name, type, status")
      .order("name", { ascending: true }),
  ]);

  if (rfpsResult.error || customersResult.error || organizationsResult.error) {
    return (
      <div>
        <SectionHeader
          title="RFPs"
          description="Create and manage LTL/FTL bid events, carrier invitations, shipment data, and award logic."
        />

        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Supabase error:{" "}
          {rfpsResult.error?.message ??
            customersResult.error?.message ??
            organizationsResult.error?.message}
        </div>
      </div>
    );
  }

  const rfps = (rfpsResult.data ?? []) as AnyRow[];
  const customers = (customersResult.data ?? []) as AnyRow[];
  const organizations = (organizationsResult.data ?? []) as AnyRow[];

  const orgById = new Map<string, AnyRow>();
  organizations.forEach((org) => {
    orgById.set(String(org.id), org);
  });

  const customerById = new Map<string, AnyRow>();
  customers.forEach((customer) => {
    customerById.set(String(customer.id), customer);
  });

  const customerOptions = customers
    .map((customer) => {
      const org = orgById.get(String(customer.organization_id));

      return {
        id: String(customer.id),
        name: String(org?.name ?? "Unknown customer"),
        type: String(org?.type ?? ""),
      };
    })
    .filter((customer) => customer.name !== "Unknown customer")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <SectionHeader
        title="RFPs"
        description="Create and manage LTL/FTL bid events, carrier invitations, shipment data, analytics, and awards."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Dashboard
            </Link>

            <Link
              href="/customers"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Customers
            </Link>
          </div>
        }
      />

      <form
        action={createRfp}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-950">Create RFP</h2>
          <p className="mt-1 text-sm text-slate-600">
            Start a new RFP package for a direct customer or 3PL-controlled customer.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            Customer
            <select
              name="customer_id"
              required
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select customer</option>
              {customerOptions.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            RFP name
            <input
              name="name"
              required
              placeholder="Example: FreightLabs Domestic LTL"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Mode
            <select
              name="mode"
              defaultValue="LTL"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="LTL">LTL</option>
              <option value="FTL">FTL</option>
              <option value="LTL/FTL">LTL/FTL</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              name="status"
              defaultValue="active"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="closed">closed</option>
              <option value="complete">complete</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Bid due date
            <input
              name="bid_due_date"
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Effective date
            <input
              name="effective_date"
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Expiration date
            <input
              name="expiration_date"
              type="date"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Pricing format
            <input
              name="required_pricing_format"
              placeholder="Discount/min, RPM, CWT, etc."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Carrier instructions
            <textarea
              name="carrier_instructions"
              placeholder="Carrier submission instructions, due dates, exclusions, assumptions, etc."
              className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Internal notes
            <textarea
              name="internal_notes"
              placeholder="Internal strategy notes, pricing concerns, carrier strategy, etc."
              className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Fuel assumptions
            <textarea
              name="fuel_assumptions"
              placeholder="Example: FSC should be quoted as percentage of discounted linehaul."
              className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Accessorial assumptions
            <textarea
              name="accessorial_assumptions"
              placeholder="Example: appointment required, liftgate quoted separately, limited access as applicable."
              className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!customerOptions.length}
          className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Create RFP
        </button>
      </form>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Showing{" "}
        <span className="font-semibold text-slate-950">{rfps.length}</span>{" "}
        RFPs from your live Supabase database.
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">RFP</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Bid Due</th>
              <th className="px-4 py-3">Effective</th>
              <th className="px-4 py-3">Pricing Format</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {rfps.map((rfp) => {
              const customer = customerById.get(String(rfp.customer_id));
              const org = customer ? orgById.get(String(customer.organization_id)) : null;

              return (
                <tr key={String(rfp.id)}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    <Link href={`/rfps/${rfp.id}`} className="hover:underline">
                      {rfp.name}
                    </Link>
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {org?.name ?? "Unknown customer"}
                  </td>

                  <td className="px-4 py-3 text-slate-600">{rfp.mode ?? "-"}</td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(
                        rfp.status
                      )}`}
                    >
                      {rfp.status ?? "-"}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(rfp.bid_due_date)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(rfp.effective_date)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {rfp.required_pricing_format ?? "-"}
                  </td>
                </tr>
              );
            })}

            {!rfps.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={7}>
                  No RFPs found yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}