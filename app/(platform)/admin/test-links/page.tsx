import Link from "next/link";
import { revalidatePath } from "next/cache";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { requirePricingUser } from "@/lib/portal-access";

type RfpRow = {
  id: string;
  name: string;
  status: string | null;
  customer_organization_id: string | null;
  customer_portal_visible: boolean | null;
  customer_results_visible: boolean | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  type: string;
  status: string;
};

type CarrierInviteRow = {
  id: string;
  rfp_id: string;
  carrier_organization_id: string;
  status: string;
};

async function updateCustomerPortalSettings(formData: FormData) {
  "use server";

  await requirePricingUser();

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") ?? "").trim();
  const customerOrganizationId = String(formData.get("customer_organization_id") ?? "").trim();
  const customerPortalVisible = String(formData.get("customer_portal_visible") ?? "") === "on";
  const customerResultsVisible = String(formData.get("customer_results_visible") ?? "") === "on";

  if (!rfpId) {
    throw new Error("RFP is required.");
  }

  const { error } = await supabase
    .from("rfps")
    .update({
      customer_organization_id: customerOrganizationId || null,
      customer_portal_visible: customerPortalVisible,
      customer_results_visible: customerResultsVisible,
    })
    .eq("id", rfpId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/test-links");
  revalidatePath("/customer/rfps");
  revalidatePath(`/customer/rfps/${rfpId}`);
}

export default async function TestLinksPage() {
  await requirePricingUser();

  const supabase = createServiceSupabaseClient();

  const [rfpsResult, organizationsResult, invitesResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, status, customer_organization_id, customer_portal_visible, customer_results_visible")
      .order("created_at", { ascending: false }),

    supabase
      .from("organizations")
      .select("id, name, type, status")
      .order("name", { ascending: true }),

    supabase
      .from("rfp_carrier_invites")
      .select("id, rfp_id, carrier_organization_id, status")
      .order("created_at", { ascending: false }),
  ]);

  if (rfpsResult.error || organizationsResult.error || invitesResult.error) {
    throw new Error(
      rfpsResult.error?.message ??
        organizationsResult.error?.message ??
        invitesResult.error?.message
    );
  }

  const rfps = (rfpsResult.data ?? []) as RfpRow[];
  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];
  const invites = (invitesResult.data ?? []) as CarrierInviteRow[];

  const customerOrgs = organizations.filter((org) => org.type === "customer");
  const orgById = new Map(organizations.map((org) => [org.id, org]));

  return (
    <div>
      <SectionHeader
        title="Test Go-Live Links"
        description="Use this page to prepare customer and carrier portal test links before sending anything externally."
      />

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-800">
        Main login/redirect link for all users: <span className="font-semibold">/portal</span>. After login, users are routed based on their platform role.
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Master View</h2>
        <p className="mt-1 text-sm text-slate-600">
          Only internal roles can access the master platform pages.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Open master dashboard
        </Link>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Customer Portal Settings</h2>
        <p className="mt-1 text-sm text-slate-600">
          Assign each RFP to a customer organization and control whether the customer can see the RFP/results.
        </p>

        <div className="mt-4 space-y-4">
          {rfps.map((rfp) => (
            <form
              key={rfp.id}
              action={updateCustomerPortalSettings}
              className="rounded-xl border border-slate-200 p-4"
            >
              <input type="hidden" name="rfp_id" value={rfp.id} />

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="font-semibold text-slate-950">{rfp.name}</p>
                  <p className="text-xs text-slate-500">{rfp.status ?? "draft"}</p>
                </div>

                <label className="text-sm font-medium text-slate-700">
                  Customer organization
                  <select
                    name="customer_organization_id"
                    defaultValue={rfp.customer_organization_id ?? ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {customerOrgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    name="customer_portal_visible"
                    type="checkbox"
                    defaultChecked={Boolean(rfp.customer_portal_visible)}
                  />
                  Show in customer portal
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    name="customer_results_visible"
                    type="checkbox"
                    defaultChecked={Boolean(rfp.customer_results_visible)}
                  />
                  Release routing results
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Save settings
                </button>

                <Link
                  href={`/customer/rfps/${rfp.id}`}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Preview customer link
                </Link>
              </div>
            </form>
          ))}

          {!rfps.length && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No RFPs found yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Carrier Portal Links</h2>
        <p className="mt-1 text-sm text-slate-600">
          These links are generated from carrier invitations created on Access Control.
        </p>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">RFP</th>
                <th className="px-4 py-3">Carrier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Test Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invites.map((invite) => {
                const rfp = rfps.find((item) => item.id === invite.rfp_id);
                const carrierOrg = orgById.get(invite.carrier_organization_id);

                return (
                  <tr key={invite.id}>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {rfp?.name ?? "Unknown RFP"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {carrierOrg?.name ?? "Unknown carrier"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{invite.status}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/carrier/rfps/${invite.rfp_id}?carrierOrgId=${invite.carrier_organization_id}`}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                      >
                        Preview carrier link
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {!invites.length && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={4}>
                    No carrier invitations yet. Create invitations from Access Control.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
