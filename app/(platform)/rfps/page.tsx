import Link from "next/link";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type CustomerRow = {
  id: string;
  organization_id: string;
  industry: string | null;
  mode_focus: "LTL" | "FTL" | "BOTH";
};

type OrganizationRow = {
  id: string;
  name: string;
  status: string;
};

type RfpRow = {
  id: string;
  customer_id: string;
  name: string;
  mode: "LTL" | "FTL" | "BOTH";
  status: "draft" | "active" | "closed" | "archived";
  bid_due_date: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  required_pricing_format: string | null;
};

async function createRfp(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const rfpId = randomUUID();

  const customerId = String(formData.get("customer_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const mode = String(formData.get("mode") ?? "LTL").trim();
  const status = String(formData.get("status") ?? "draft").trim();

  const bidDueDate = String(formData.get("bid_due_date") ?? "").trim();
  const effectiveDate = String(formData.get("effective_date") ?? "").trim();
  const expirationDate = String(formData.get("expiration_date") ?? "").trim();

  const description = String(formData.get("description") ?? "").trim();
  const internalNotes = String(formData.get("internal_notes") ?? "").trim();
  const carrierInstructions = String(formData.get("carrier_instructions") ?? "").trim();
  const accessorialAssumptions = String(formData.get("accessorial_assumptions") ?? "").trim();
  const fuelAssumptions = String(formData.get("fuel_assumptions") ?? "").trim();
  const requiredPricingFormat = String(formData.get("required_pricing_format") ?? "").trim();

  if (!customerId) {
    throw new Error("Customer is required.");
  }

  if (!name) {
    throw new Error("RFP name is required.");
  }

  const { error } = await supabase.from("rfps").insert({
    id: rfpId,
    customer_id: customerId,
    name,
    mode,
    status,
    bid_due_date: bidDueDate || null,
    effective_date: effectiveDate || null,
    expiration_date: expirationDate || null,
    description: description || null,
    internal_notes: internalNotes || null,
    carrier_instructions: carrierInstructions || null,
    accessorial_assumptions: accessorialAssumptions || null,
    fuel_assumptions: fuelAssumptions || null,
    required_pricing_format: requiredPricingFormat || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/rfps");
  revalidatePath("/dashboard");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default async function RfpsPage() {
  const supabase = createServiceSupabaseClient();

  const [rfpsResult, customersResult, organizationsResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, customer_id, name, mode, status, bid_due_date, effective_date, expiration_date, required_pricing_format")
      .order("created_at", { ascending: false }),

    supabase
      .from("customers")
      .select("id, organization_id, industry, mode_focus")
      .order("created_at", { ascending: false }),

    supabase
      .from("organizations")
      .select("id, name, status")
      .in("type", ["customer"]),
  ]);

  if (rfpsResult.error || customersResult.error || organizationsResult.error) {
    return (
      <div>
        <SectionHeader
          title="RFPs"
          description="Create and manage LTL/FTL bid events, carrier invitations, shipment data, and award logic."
        />

        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Supabase error: {rfpsResult.error?.message ?? customersResult.error?.message ?? organizationsResult.error?.message}
        </div>
      </div>
    );
  }

  const rfps = (rfpsResult.data ?? []) as RfpRow[];
  const customers = (customersResult.data ?? []) as CustomerRow[];
  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];

  const orgById = new Map(organizations.map((org) => [org.id, org]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  return (
    <div>
      <SectionHeader
        title="RFPs"
        description="Create and manage LTL/FTL bid events, carrier invitations, shipment data, and award logic."
      />

      <form
        action={createRfp}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-slate-950">Create RFP</h2>

        {!customers.length && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            You need at least one customer before creating an RFP.
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Customer
            <select
              name="customer_id"
              required
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select customer</option>
              {customers.map((customer) => {
                const org = orgById.get(customer.organization_id);

                return (
                  <option key={customer.id} value={customer.id}>
                    {org?.name ?? "Unnamed customer"}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            RFP name
            <input
              name="name"
              required
              placeholder="Example: Better Earth 2026 LTL RFP"
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
              <option value="BOTH">Both</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              name="status"
              defaultValue="draft"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
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
            Required pricing format
            <input
              name="required_pricing_format"
              placeholder="Discount / minimum / fuel / accessorial pricing"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Description
            <textarea
              name="description"
              placeholder="Short description of the RFP."
              className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Carrier instructions
            <textarea
              name="carrier_instructions"
              placeholder="Tell carriers what they need to submit, assumptions, due dates, exclusions, etc."
              className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Accessorial assumptions
            <textarea
              name="accessorial_assumptions"
              placeholder="Example: appointment required on all deliveries, liftgate priced separately, limited access as applicable, etc."
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
            Internal notes
            <textarea
              name="internal_notes"
              placeholder="Internal pricing notes, customer concerns, carrier strategy, etc."
              className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!customers.length}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Create RFP
        </button>
      </form>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Showing <span className="font-semibold text-slate-950">{rfps.length}</span> RFPs from your live Supabase database.
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
              const customer = customerById.get(rfp.customer_id);
              const org = customer ? orgById.get(customer.organization_id) : null;

              return (
                <tr key={rfp.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    <Link href={`/rfps/${rfp.id}`} className="hover:underline">
                      {rfp.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {org?.name ?? "Unknown customer"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{rfp.mode}</td>
                  <td className="px-4 py-3 text-slate-600">{rfp.status}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(rfp.bid_due_date)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(rfp.effective_date)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {rfp.required_pricing_format ?? "—"}
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
