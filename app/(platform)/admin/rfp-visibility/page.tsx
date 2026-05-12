import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalPlatformUser } from "@/lib/portal-access";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

const accessAdminRoles = new Set([
  "owner",
  "admin",
  "pricing_admin",
  "pricing_manager",
  "pricing_director",
]);

async function requireAccessAdmin() {
  const user = await requireInternalPlatformUser();

  if (!accessAdminRoles.has(user.platform_role)) {
    redirect("/unauthorized");
  }

  return user;
}

function getRfpName(rfp: AnyRow) {
  return rfp.name || rfp.title || rfp.rfp_name || "Untitled RFP";
}

async function updateRfpControl(formData: FormData) {
  "use server";

  await requireAccessAdmin();

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") || "");
  const customerOrganizationId = String(formData.get("customer_organization_id") || "") || null;
  const managingOrganizationId = String(formData.get("managing_organization_id") || "") || null;
  const rfpControlType = String(formData.get("rfp_control_type") || "managed_by_3pl");

  if (!rfpId) {
    throw new Error("Missing RFP ID.");
  }

  const { error: rfpError } = await supabase
    .from("rfps")
    .update({
      customer_organization_id: customerOrganizationId,
      managing_organization_id: managingOrganizationId,
      rfp_control_type: rfpControlType,
    })
    .eq("id", rfpId);

  if (rfpError) {
    throw new Error(rfpError.message);
  }

  const visibilityPayload = {
    rfp_id: rfpId,
    show_in_customer_portal: formData.get("show_in_customer_portal") === "on",
    allow_customer_uploads: formData.get("allow_customer_uploads") === "on",
    allow_customer_edits: formData.get("allow_customer_edits") === "on",
    allow_customer_carrier_invites:
      formData.get("allow_customer_carrier_invites") === "on",
    show_carrier_names: formData.get("show_carrier_names") === "on",
    show_submission_status: formData.get("show_submission_status") === "on",
    show_bid_amounts: formData.get("show_bid_amounts") === "on",
    show_savings: formData.get("show_savings") === "on",
    show_comparisons: formData.get("show_comparisons") === "on",
    show_routing_guide: formData.get("show_routing_guide") === "on",
    show_award_recommendation:
      formData.get("show_award_recommendation") === "on",
    updated_at: new Date().toISOString(),
  };

  const { error: visibilityError } = await supabase
    .from("rfp_customer_visibility")
    .upsert(visibilityPayload, { onConflict: "rfp_id" });

  if (visibilityError) {
    throw new Error(visibilityError.message);
  }

  revalidatePath("/admin/rfp-visibility");
  revalidatePath("/customer/rfps");
}

function Checkbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
      <input name={name} type="checkbox" defaultChecked={checked} />
      {label}
    </label>
  );
}

export default async function RfpVisibilityPage() {
  await requireAccessAdmin();

  const supabase = createServiceSupabaseClient();

  const { data: rfps, error: rfpsError } = await supabase
    .from("rfps")
    .select("*");

  if (rfpsError) {
    throw new Error(rfpsError.message);
  }

  const { data: organizations, error: orgsError } = await supabase
    .from("organizations")
    .select("*")
    .order("name", { ascending: true });

  if (orgsError) {
    throw new Error(orgsError.message);
  }

  const { data: visibilityRows, error: visibilityError } = await supabase
    .from("rfp_customer_visibility")
    .select("*");

  if (visibilityError) {
    throw new Error(visibilityError.message);
  }

  const visibilityByRfp = new Map(
    (visibilityRows || []).map((row: AnyRow) => [row.rfp_id, row])
  );

  const customerOrgs = (organizations || []).filter((org: AnyRow) =>
    ["customer"].includes(org.organization_type)
  );

  const managerOrgs = (organizations || []).filter((org: AnyRow) =>
    ["3pl", "internal"].includes(org.organization_type)
  );

  return (
    <main className="p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">
          RFP Customer Controls
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Assign RFP ownership and control exactly what each customer can see.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {(rfps || []).map((rfp: AnyRow) => {
          const visibility = visibilityByRfp.get(rfp.id) || {};

          return (
            <form
              key={rfp.id}
              action={updateRfpControl}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <input type="hidden" name="rfp_id" value={rfp.id} />

              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-950">
                    {getRfpName(rfp)}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    RFP ID: {rfp.id}
                  </p>
                </div>

                <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                  Save RFP controls
                </button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <label className="text-sm font-medium text-slate-700">
                  Customer organization
                  <select
                    name="customer_organization_id"
                    defaultValue={rfp.customer_organization_id || ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">None selected</option>
                    {customerOrgs.map((org: AnyRow) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Managing organization / 3PL
                  <select
                    name="managing_organization_id"
                    defaultValue={rfp.managing_organization_id || ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">No 3PL / customer managed</option>
                    {managerOrgs.map((org: AnyRow) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Control type
                  <select
                    name="rfp_control_type"
                    defaultValue={rfp.rfp_control_type || "managed_by_3pl"}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="managed_by_3pl">Managed by 3PL</option>
                    <option value="customer_direct">Customer direct</option>
                    <option value="internal_only">Internal only</option>
                  </select>
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-950">Customer visibility</p>
                <p className="mt-1 text-sm text-slate-600">
                  Unchecked items are hidden from the customer portal.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <Checkbox
                    name="show_in_customer_portal"
                    label="Show in customer portal"
                    checked={visibility.show_in_customer_portal ?? true}
                  />
                  <Checkbox
                    name="allow_customer_uploads"
                    label="Allow customer uploads"
                    checked={visibility.allow_customer_uploads ?? false}
                  />
                  <Checkbox
                    name="allow_customer_edits"
                    label="Allow customer edits"
                    checked={visibility.allow_customer_edits ?? false}
                  />
                  <Checkbox
                    name="allow_customer_carrier_invites"
                    label="Allow customer carrier invites"
                    checked={visibility.allow_customer_carrier_invites ?? false}
                  />
                  <Checkbox
                    name="show_carrier_names"
                    label="Show carrier names"
                    checked={visibility.show_carrier_names ?? false}
                  />
                  <Checkbox
                    name="show_submission_status"
                    label="Show submission status"
                    checked={visibility.show_submission_status ?? false}
                  />
                  <Checkbox
                    name="show_bid_amounts"
                    label="Show bid amounts"
                    checked={visibility.show_bid_amounts ?? false}
                  />
                  <Checkbox
                    name="show_savings"
                    label="Show savings"
                    checked={visibility.show_savings ?? false}
                  />
                  <Checkbox
                    name="show_comparisons"
                    label="Show comparisons"
                    checked={visibility.show_comparisons ?? false}
                  />
                  <Checkbox
                    name="show_routing_guide"
                    label="Show routing guide"
                    checked={visibility.show_routing_guide ?? false}
                  />
                  <Checkbox
                    name="show_award_recommendation"
                    label="Show award recommendation"
                    checked={visibility.show_award_recommendation ?? false}
                  />
                </div>
              </div>
            </form>
          );
        })}

        {!(rfps || []).length && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No RFPs exist yet.
          </div>
        )}
      </div>
    </main>
  );
}