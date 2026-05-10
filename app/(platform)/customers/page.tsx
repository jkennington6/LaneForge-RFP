import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type CustomerRow = {
  id: string;
  industry: string | null;
  contact_name: string | null;
  contact_email: string | null;
  mode_focus: "LTL" | "FTL" | "BOTH";
  notes: string | null;
  organizations: {
    name: string;
    status: string;
  } | null;
};

async function createCustomer(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const organizationId = randomUUID();
  const customerId = randomUUID();

  const name = String(formData.get("name") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const modeFocus = String(formData.get("mode_focus") ?? "LTL").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) {
    throw new Error("Customer name is required.");
  }

  const { error: orgError } = await supabase.from("organizations").insert({
    id: organizationId,
    name,
    type: "customer",
    status: "active",
    notes: notes || null,
  });

  if (orgError) {
    throw new Error(orgError.message);
  }

  const { error: customerError } = await supabase.from("customers").insert({
    id: customerId,
    organization_id: organizationId,
    industry: industry || null,
    contact_name: contactName || null,
    contact_email: contactEmail || null,
    mode_focus: modeFocus,
    notes: notes || null,
  });

  if (customerError) {
    throw new Error(customerError.message);
  }

  revalidatePath("/customers");
  revalidatePath("/dashboard");
}

export default async function CustomersPage() {
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("customers")
    .select(`
      id,
      industry,
      contact_name,
      contact_email,
      mode_focus,
      notes,
      organizations (
        name,
        status
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div>
        <SectionHeader
          title="Customers"
          description="Create customer organizations, assign users, manage RFP access, and store customer assumptions."
        />
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Supabase error: {error.message}
        </div>
      </div>
    );
  }

  const customers = (data ?? []) as unknown as CustomerRow[];

  return (
    <div>
      <SectionHeader
        title="Customers"
        description="Create customer organizations, assign users, manage RFP access, and store customer assumptions."
      />

      <form
        action={createCustomer}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-slate-950">Create customer</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Customer name
            <input
              name="name"
              required
              placeholder="Example: Better Earth Packaging"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Industry
            <input
              name="industry"
              placeholder="Packaging, Manufacturing, Retail, etc."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Contact name
            <input
              name="contact_name"
              placeholder="Primary contact"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Contact email
            <input
              name="contact_email"
              type="email"
              placeholder="contact@example.com"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Mode focus
            <select
              name="mode_focus"
              defaultValue="LTL"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="LTL">LTL</option>
              <option value="FTL">FTL</option>
              <option value="BOTH">Both</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Notes
            <textarea
              name="notes"
              placeholder="Customer assumptions, accessorial concerns, special requirements, etc."
              className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Create customer
        </button>
      </form>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Showing <span className="font-semibold text-slate-950">{customers.length}</span> customers from your live Supabase database.
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Industry</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {customer.organizations?.name ?? "Unnamed customer"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {customer.industry ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {customer.contact_name ?? "—"}
                  <br />
                  <span className="text-xs text-slate-400">
                    {customer.contact_email ?? "No email"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {customer.mode_focus}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {customer.organizations?.status ?? "active"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {customer.notes ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
