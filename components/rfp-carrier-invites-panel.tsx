import Link from "next/link";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

const inviteManagerRoles = new Set([
  "owner",
  "admin",
  "pricing_admin",
  "pricing_manager",
  "pricing_director",
  "internal_user",
  "3pl_admin",
  "customer_admin",
]);

async function requireInvitePermission() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  const supabase = createServiceSupabaseClient();

  const { data: user, error } = await supabase
    .from("platform_users")
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!user) {
    throw new Error("Your LaneForge user record does not exist yet.");
  }

  const status = String(user.status || "active");
  const platformRole = String(user.platform_role || "");

  if (status !== "active") {
    throw new Error("Your LaneForge account is not active.");
  }

  if (inviteManagerRoles.has(platformRole)) {
    return user;
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("platform_user_organizations")
    .select("organization_role,status")
    .eq("platform_user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const hasOrgAdminAccess = (memberships || []).some((membership: AnyRow) =>
    ["owner", "admin", "3pl_admin", "customer_admin"].includes(
      String(membership.organization_role || "")
    )
  );

  if (!hasOrgAdminAccess) {
    throw new Error("You do not have permission to invite carriers.");
  }

  return user;
}

export async function createRfpCarrierInvite(formData: FormData) {
  "use server";

  await requireInvitePermission();

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") || "");
  const carrierOrganizationId = String(
    formData.get("carrier_organization_id") || ""
  );
  const notes = String(formData.get("notes") || "").trim();

  if (!rfpId || !carrierOrganizationId) {
    throw new Error("RFP and carrier are required.");
  }

  const now = new Date().toISOString();

  const { error } = await supabase.from("rfp_carrier_invites").upsert(
    {
      rfp_id: rfpId,
      carrier_organization_id: carrierOrganizationId,
      invite_status: "invited",
      visibility_status: "carrier_only",
      notes,
      invited_at: now,
      updated_at: now,
    },
    {
      onConflict: "rfp_id,carrier_organization_id",
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/rfps/${rfpId}`);
  revalidatePath(`/rfps/${rfpId}/invites`);
  revalidatePath(`/carrier/rfps/${rfpId}`);
}

export async function removeRfpCarrierInvite(formData: FormData) {
  "use server";

  await requireInvitePermission();

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") || "");
  const inviteId = String(formData.get("invite_id") || "");

  if (!rfpId || !inviteId) {
    throw new Error("Invite ID is required.");
  }

  const { error } = await supabase
    .from("rfp_carrier_invites")
    .delete()
    .eq("id", inviteId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/rfps/${rfpId}`);
  revalidatePath(`/rfps/${rfpId}/invites`);
  revalidatePath(`/carrier/rfps/${rfpId}`);
}

export async function RfpCarrierInvitesPanel({ rfpId }: { rfpId: string }) {
  const supabase = createServiceSupabaseClient();

  const { data: carrierOrgs, error: carrierError } = await supabase
    .from("organizations")
    .select("id,name,organization_type,status,logo_url,brand_color")
    .eq("organization_type", "carrier")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (carrierError) {
    throw new Error(carrierError.message);
  }

  const { data: invites, error: inviteError } = await supabase
    .from("rfp_carrier_invites")
    .select("*")
    .eq("rfp_id", rfpId)
    .order("created_at", { ascending: false });

  if (inviteError) {
    throw new Error(inviteError.message);
  }

  const carriers = carrierOrgs || [];
  const inviteRows = invites || [];

  const carrierById = new Map(
    carriers.map((carrier: AnyRow) => [String(carrier.id), carrier])
  );

  const invitedCarrierIds = new Set(
    inviteRows.map((invite: AnyRow) =>
      String(invite.carrier_organization_id || "")
    )
  );

  const availableCarriers = carriers.filter(
    (carrier: AnyRow) => !invitedCarrierIds.has(String(carrier.id))
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Carrier invitations
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Invite active carrier organizations to this RFP. Invited carriers
            will access their carrier portal view only.
          </p>
        </div>

        <Link
          href={`/carrier/rfps/${rfpId}`}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Preview carrier view
        </Link>
      </div>

      <form action={createRfpCarrierInvite} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="rfp_id" value={rfpId} />

        <select
          name="carrier_organization_id"
          required
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          defaultValue=""
        >
          <option value="" disabled>
            Select carrier
          </option>
          {availableCarriers.map((carrier: AnyRow) => (
            <option key={carrier.id} value={carrier.id}>
              {carrier.name}
            </option>
          ))}
        </select>

        <input
          name="notes"
          placeholder="Optional invite notes"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        >
          Invite carrier
        </button>
      </form>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Invite status</th>
              <th className="px-4 py-3">Portal path</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {inviteRows.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={5}>
                  No carriers have been invited yet.
                </td>
              </tr>
            )}

            {inviteRows.map((invite: AnyRow) => {
              const carrier = carrierById.get(
                String(invite.carrier_organization_id || "")
              );

              return (
                <tr key={invite.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-950">
                      {carrier?.name || "Carrier organization"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {invite.carrier_organization_id}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      {invite.invite_status || "invited"}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/carrier/rfps/${rfpId}`}
                      className="text-sm font-semibold text-slate-700 underline"
                    >
                      /carrier/rfps/{rfpId}
                    </Link>
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {invite.notes || "—"}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <form action={removeRfpCarrierInvite}>
                      <input type="hidden" name="rfp_id" value={rfpId} />
                      <input type="hidden" name="invite_id" value={invite.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}