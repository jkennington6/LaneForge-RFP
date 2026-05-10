import Link from "next/link";
import {
  getCustomerOrgIdsForCurrentUser,
  requireCustomerPortalUser,
} from "@/lib/portal-access";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function getRfpName(rfp: AnyRow) {
  return rfp.name || rfp.title || rfp.rfp_name || "Untitled RFP";
}

function getRfpDueDate(rfp: AnyRow) {
  return rfp.due_date || rfp.response_due_date || rfp.deadline || "Not set";
}

function getRfpStatus(rfp: AnyRow) {
  return rfp.status || "Active";
}

export default async function CustomerRfpsPage() {
  const user = await requireCustomerPortalUser();
  const supabase = createServiceSupabaseClient();

  const customerOrgIds = (await getCustomerOrgIdsForCurrentUser(user)) ?? [];

  if (!customerOrgIds.length) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold text-slate-950">Customer RFPs</h1>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Your account is active, but it has not been linked to a customer
          organization yet. Contact the Super Admin to complete setup.
        </div>
      </main>
    );
  }

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id,name,organization_type,logo_url,brand_color,status")
    .in("id", customerOrgIds)
    .eq("status", "active");

  const organization = (orgs || [])[0] as AnyRow | undefined;

  const { data: rfps, error } = await supabase
    .from("rfps")
    .select("*")
    .in("customer_organization_id", customerOrgIds);

  if (error) {
    throw new Error(error.message);
  }

  const rfpRows = (rfps || []) as AnyRow[];
  const rfpIds = rfpRows.map((rfp) => rfp.id).filter(Boolean);

  const { data: visibilityRows } = rfpIds.length
    ? await supabase
        .from("rfp_customer_visibility")
        .select("*")
        .in("rfp_id", rfpIds)
        .eq("show_in_customer_portal", true)
    : { data: [] };

  const visibleIds = new Set(
    (visibilityRows || []).map((row: AnyRow) => row.rfp_id)
  );

  const visibleRfps = rfpRows.filter((rfp) => visibleIds.has(rfp.id));

  return (
    <main className="p-6">
      {organization && (
        <div
          className="mb-6 rounded-2xl border bg-white p-5 shadow-sm"
          style={{ borderColor: organization.brand_color || "#e2e8f0" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border bg-slate-50"
              style={{ borderColor: organization.brand_color || "#e2e8f0" }}
            >
              {organization.logo_url ? (
                <img
                  src={organization.logo_url}
                  alt={organization.name}
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <span className="text-lg font-bold text-slate-400">
                  {String(organization.name || "?").slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Customer Portal
              </p>
              <h1 className="text-2xl font-bold text-slate-950">
                {organization.name}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Powered by LaneForge RFP
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950">Customer RFPs</h2>
          <p className="mt-1 text-sm text-slate-600">
            View RFPs released to your customer portal. Bid details, savings,
            comparisons, and awards are only shown when released by the managing
            organization.
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">RFP</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Results</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {visibleRfps.map((rfp) => (
              <tr key={rfp.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {getRfpName(rfp)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {getRfpDueDate(rfp)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {getRfpStatus(rfp)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  Not released yet
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/customer/rfps/${rfp.id}`}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}

            {!visibleRfps.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No RFPs have been released to your customer portal yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}