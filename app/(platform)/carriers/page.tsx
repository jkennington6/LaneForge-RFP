import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type CarrierRow = {
  id: string;
  organization_id: string;
  scac: string | null;
  service_type: string | null;
  contact_name: string | null;
  contact_email: string | null;
  coverage_notes: string | null;
  is_excluded: boolean;
  inactive: boolean;
};

type OrganizationRow = {
  id: string;
  name: string;
  status: string;
};

async function createCarrier(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const organizationId = randomUUID();
  const carrierId = randomUUID();

  const name = String(formData.get("name") ?? "").trim();
  const scac = String(formData.get("scac") ?? "").trim().toUpperCase();
  const serviceType = String(formData.get("service_type") ?? "National LTL").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const coverageNotes = String(formData.get("coverage_notes") ?? "").trim();
  const isExcluded = formData.get("is_excluded") === "on";
  const inactive = formData.get("inactive") === "on";

  if (!name) {
    throw new Error("Carrier name is required.");
  }

  const { error: orgError } = await supabase.from("organizations").insert({
    id: organizationId,
    name,
    type: "carrier",
    status: inactive ? "disabled" : "active",
    notes: coverageNotes || null,
  });

  if (orgError) {
    throw new Error(orgError.message);
  }

  const { error: carrierError } = await supabase.from("carriers").insert({
    id: carrierId,
    organization_id: organizationId,
    scac: scac || null,
    service_type: serviceType || null,
    contact_name: contactName || null,
    contact_email: contactEmail || null,
    coverage_notes: coverageNotes || null,
    is_excluded: isExcluded,
    inactive,
  });

  if (carrierError) {
    throw new Error(carrierError.message);
  }

  revalidatePath("/carriers");
  revalidatePath("/dashboard");
}

export default async function CarriersPage() {
  const supabase = createServiceSupabaseClient();

  const [carriersResult, organizationsResult] = await Promise.all([
    supabase
      .from("carriers")
      .select("id, organization_id, scac, service_type, contact_name, contact_email, coverage_notes, is_excluded, inactive")
      .order("scac", { ascending: true }),

    supabase
      .from("organizations")
      .select("id, name, status")
      .eq("type", "carrier"),
  ]);

  if (carriersResult.error || organizationsResult.error) {
    return (
      <div>
        <SectionHeader
          title="Carriers"
          description="Manage carrier organizations, coverage notes, active/excluded status, and RFP invitations."
        />

        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Supabase error: {carriersResult.error?.message ?? organizationsResult.error?.message}
        </div>
      </div>
    );
  }

  const carriers = (carriersResult.data ?? []) as CarrierRow[];
  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];
  const orgById = new Map(organizations.map((org) => [org.id, org]));

  return (
    <div>
      <SectionHeader
        title="Carriers"
        description="Manage carrier organizations, coverage notes, active/excluded status, and RFP invitations."
      />

      <form
        action={createCarrier}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-slate-950">Create carrier</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Carrier name
            <input
              name="name"
              required
              placeholder="Example: Old Dominion"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            SCAC
            <input
              name="scac"
              placeholder="ODFL"
              maxLength={8}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Service type
            <select
              name="service_type"
              defaultValue="National LTL"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="National LTL">National LTL</option>
              <option value="Regional LTL">Regional LTL</option>
              <option value="FTL">FTL</option>
              <option value="Expedited">Expedited</option>
              <option value="Specialized">Specialized</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Contact name
            <input
              name="contact_name"
              placeholder="Primary carrier contact"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Contact email
            <input
              name="contact_email"
              type="email"
              placeholder="pricing@carrier.com"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="flex items-center gap-6 pt-7">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input name="is_excluded" type="checkbox" />
              Excluded from awards
            </label>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input name="inactive" type="checkbox" />
              Inactive
            </label>
          </div>

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Coverage notes
            <textarea
              name="coverage_notes"
              placeholder="Coverage strengths, regions, limitations, customer concerns, etc."
              className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Create carrier
        </button>
      </form>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Showing <span className="font-semibold text-slate-950">{carriers.length}</span> carriers from your live Supabase database.
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">SCAC</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Coverage</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {carriers.map((carrier) => {
              const org = orgById.get(carrier.organization_id);

              let status = "Active";
              if (carrier.inactive) status = "Inactive";
              if (carrier.is_excluded) status = "Excluded";

              return (
                <tr key={carrier.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {org?.name ?? "Unnamed carrier"}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {carrier.scac ?? "—"}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {carrier.contact_name ?? "—"}
                    <br />
                    <span className="text-xs text-slate-400">
                      {carrier.contact_email ?? "No email"}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {carrier.service_type ?? "—"}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {status}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {carrier.coverage_notes ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
