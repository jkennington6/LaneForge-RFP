import Link from "next/link";
import { revalidatePath } from "next/cache";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type InviteRow = {
  id: string;
  rfp_id: string;
  carrier_name: string;
  contact_name: string | null;
  contact_email: string;
  status: string;
  invite_token: string;
  invited_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  notes: string | null;
  created_at: string;
};

type RfpRow = {
  id: string;
  name: string;
  mode: string;
  status: string;
  bid_due_date: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  );
}

async function createInvite(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") ?? "").trim();
  const carrierName = String(formData.get("carrier_name") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim().toLowerCase();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!rfpId) {
    throw new Error("RFP ID is required.");
  }

  if (!carrierName) {
    throw new Error("Carrier name is required.");
  }

  if (!contactEmail) {
    throw new Error("Contact email is required.");
  }

  const { error } = await supabase.from("rfp_carrier_invites").insert({
    rfp_id: rfpId,
    carrier_name: carrierName,
    contact_name: contactName || null,
    contact_email: contactEmail,
    status: "draft",
    notes: notes || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/rfps/${rfpId}/invites`);
  revalidatePath(`/rfps/${rfpId}`);
}

async function markInviteSent(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") ?? "").trim();
  const inviteId = String(formData.get("invite_id") ?? "").trim();

  if (!rfpId || !inviteId) {
    throw new Error("RFP ID and invite ID are required.");
  }

  const { error } = await supabase
    .from("rfp_carrier_invites")
    .update({
      status: "invited",
      invited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId)
    .eq("rfp_id", rfpId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/rfps/${rfpId}/invites`);
}

async function declineInvite(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") ?? "").trim();
  const inviteId = String(formData.get("invite_id") ?? "").trim();

  if (!rfpId || !inviteId) {
    throw new Error("RFP ID and invite ID are required.");
  }

  const { error } = await supabase
    .from("rfp_carrier_invites")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId)
    .eq("rfp_id", rfpId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/rfps/${rfpId}/invites`);
}

export default async function RfpInvitesPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, invitesResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, mode, status, bid_due_date")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("rfp_carrier_invites")
      .select(
        "id, rfp_id, carrier_name, contact_name, contact_email, status, invite_token, invited_at, accepted_at, declined_at, notes, created_at"
      )
      .eq("rfp_id", rfpId)
      .order("created_at", { ascending: false }),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    throw new Error("RFP not found.");
  }

  if (invitesResult.error) {
    throw new Error(invitesResult.error.message);
  }

  const rfp = rfpResult.data as RfpRow;
  const invites = (invitesResult.data ?? []) as InviteRow[];
  const baseUrl = getBaseUrl();

  return (
    <div>
      <SectionHeader
        title="Carrier Invites"
        description={`${rfp.name} - ${rfp.mode} - Bid due ${formatDate(rfp.bid_due_date)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to RFP
            </Link>
          </div>
        }
      />

      <form
        action={createInvite}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <input type="hidden" name="rfp_id" value={rfp.id} />

        <h2 className="text-lg font-semibold text-slate-950">Add carrier invite</h2>
        <p className="mt-1 text-sm text-slate-600">
          Add carriers here first. This creates a secure invite link that can be copied into an email.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Carrier name
            <input
              name="carrier_name"
              required
              placeholder="Example: Saia"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Contact name
            <input
              name="contact_name"
              placeholder="Example: Jane Smith"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Contact email
            <input
              name="contact_email"
              type="email"
              required
              placeholder="pricing@carrier.com"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Notes
            <input
              name="notes"
              placeholder="Optional internal note"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Add Invite
        </button>
      </form>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Showing <span className="font-semibold text-slate-950">{invites.length}</span> carrier invite(s).
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Invite Link</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {invites.map((invite) => {
              const inviteUrl = `${baseUrl}/carrier/invite/${invite.invite_token}`;

              return (
                <tr key={invite.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {invite.carrier_name}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {invite.contact_name ?? "-"}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {invite.contact_email}
                  </td>

                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {invite.status}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <input
                      readOnly
                      value={inviteUrl}
                      className="w-80 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-600"
                    />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <form action={markInviteSent}>
                        <input type="hidden" name="rfp_id" value={rfp.id} />
                        <input type="hidden" name="invite_id" value={invite.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Mark Sent
                        </button>
                      </form>

                      <form action={declineInvite}>
                        <input type="hidden" name="rfp_id" value={rfp.id} />
                        <input type="hidden" name="invite_id" value={invite.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          Decline
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!invites.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={6}>
                  No carrier invites have been added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
