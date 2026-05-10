import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function getRfpName(rfp: AnyRow) {
  return rfp.name || rfp.title || rfp.rfp_name || "Untitled RFP";
}

function getDueDate(rfp: AnyRow) {
  return rfp.due_date || rfp.bid_due_date || rfp.response_due_date || null;
}

export default async function CarrierRfpsPage() {
  const clerkUser = await currentUser();

  if (!clerkUser?.id) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold text-slate-950">Carrier RFPs</h1>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Please sign in to view carrier RFP invitations.
        </div>
      </main>
    );
  }

  const supabase = createServiceSupabaseClient();

  const { data: platformUser, error: userError } = await supabase
    .from("platform_users")
    .select("*")
    .eq("clerk_user_id", clerkUser.id)
    .maybeSingle();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!platformUser || platformUser.status !== "active") {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold text-slate-950">Carrier RFPs</h1>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Your account is not active in LaneForge yet. Contact the Super Admin
          to complete setup.
        </div>
      </main>
    );
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("platform_user_organizations")
    .select("*, organizations(*)")
    .eq("platform_user_id", platformUser.id)
    .eq("status", "active");

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const carrierOrgIds = (memberships || [])
    .filter((membership: AnyRow) => {
      const org = membership.organizations;
      return org?.organization_type === "carrier" && org?.status === "active";
    })
    .map((membership: AnyRow) => membership.organization_id);

  if (!carrierOrgIds.length) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold text-slate-950">Carrier RFPs</h1>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Your account is active, but it has not been linked to a carrier
          organization yet. Contact the Super Admin to complete setup.
        </div>
      </main>
    );
  }

  const { data: invites, error: invitesError } = await supabase
    .from("rfp_carrier_invites")
    .select("*")
    .in("carrier_organization_id", carrierOrgIds)
    .order("created_at", { ascending: false });

  if (invitesError) {
    throw new Error(invitesError.message);
  }

  const rfpIds = Array.from(
    new Set((invites || []).map((invite: AnyRow) => invite.rfp_id).filter(Boolean))
  );

  let rfps: AnyRow[] = [];

  if (rfpIds.length) {
    const { data: rfpRows, error: rfpError } = await supabase
      .from("rfps")
      .select("*")
      .in("id", rfpIds)
      .order("created_at", { ascending: false });

    if (rfpError) {
      throw new Error(rfpError.message);
    }

    rfps = rfpRows || [];
  }

  const inviteByRfpId = new Map(
    (invites || []).map((invite: AnyRow) => [invite.rfp_id, invite])
  );

  return (
    <main className="p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Carrier RFPs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Only RFPs your carrier organization has been invited to are shown here.
        </p>
      </div>

      {rfps.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          No RFP invitations are available for your carrier organization yet.
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {rfps.map((rfp) => {
            const invite = inviteByRfpId.get(rfp.id);
            const dueDate = getDueDate(rfp);

            return (
              <Link
                key={rfp.id}
                href={`/carrier/rfps/${rfp.id}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-slate-950">
                      {getRfpName(rfp)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Status: {rfp.status || "active"}
                      {dueDate ? ` • Due: ${dueDate}` : ""}
                    </p>
                  </div>

                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {invite?.status || "invited"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}