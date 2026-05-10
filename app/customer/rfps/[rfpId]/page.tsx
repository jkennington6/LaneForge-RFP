import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  assertCustomerOrgAccess,
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

export default async function CustomerRfpDetailPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;

  const user = await requireCustomerPortalUser();
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

  await assertCustomerOrgAccess(rfp.customer_organization_id, user);

  const { data: visibility } = await supabase
    .from("rfp_customer_visibility")
    .select("*")
    .eq("rfp_id", rfpId)
    .maybeSingle();

  if (!visibility || visibility.show_in_customer_portal !== true) {
    redirect("/unauthorized");
  }

  const canSeeResults =
    visibility.show_bid_amounts ||
    visibility.show_savings ||
    visibility.show_comparisons ||
    visibility.show_routing_guide ||
    visibility.show_award_recommendation;

  return (
    <main className="p-6">
      <Link
        href="/customer/rfps"
        className="text-sm font-semibold text-slate-600 hover:text-slate-950"
      >
        Back to customer RFPs
      </Link>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">
              {getRfpName(rfp)}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Due date: {getRfpDueDate(rfp)}
            </p>
          </div>

          <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
            {getRfpStatus(rfp)}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-semibold text-slate-950">Customer view</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This page only shows information released to your customer portal.
            Carrier bid amounts, savings, comparisons, routing guides, and award
            recommendations are hidden unless released by the managing
            organization.
          </p>
        </div>

        {!canSeeResults && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">Results have not been released yet.</p>
            <p className="mt-1">
              Your account manager is still managing the RFP process. Bid
              activity, carrier pricing, savings, and award recommendations are
              not visible at this time.
            </p>
          </div>
        )}

        {visibility.show_submission_status && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-950">Submission status</h2>
            <p className="mt-2 text-sm text-slate-600">
              Submission status has been released. Detailed carrier bid amounts
              remain hidden unless separately released.
            </p>
          </div>
        )}

        {visibility.show_carrier_names && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-950">
              Participating carriers
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Carrier names may be shown here once the carrier invitation view is
              connected to this customer portal.
            </p>
          </div>
        )}

        {visibility.show_savings && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-950">Savings summary</h2>
            <p className="mt-2 text-sm text-slate-600">
              Savings visibility has been released, but detailed calculations
              should only be shown from an approved customer-facing summary.
            </p>
          </div>
        )}

        {visibility.show_routing_guide && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-950">Routing guide</h2>
            <p className="mt-2 text-sm text-slate-600">
              Routing guide visibility has been released. The customer-facing
              routing guide output will be connected here.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}