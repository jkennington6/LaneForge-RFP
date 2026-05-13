import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

async function acceptInvite(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const inviteId = String(formData.get("invite_id") ?? "").trim();
  const rfpId = String(formData.get("rfp_id") ?? "").trim();

  if (!inviteId || !rfpId) {
    throw new Error("Invite ID and RFP ID are required.");
  }

  const { error } = await supabase
    .from("rfp_carrier_invites")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/carrier/invite`);
  revalidatePath(`/rfps/${rfpId}/invites`);
}

export default async function CarrierInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceSupabaseClient();

  const { data: invite, error: inviteError } = await supabase
    .from("rfp_carrier_invites")
    .select(`
      id,
      rfp_id,
      carrier_name,
      contact_name,
      contact_email,
      status,
      invite_token,
      invited_at,
      accepted_at,
      declined_at,
      notes,
      rfps (
        id,
        name,
        mode,
        status,
        bid_due_date,
        effective_date,
        expiration_date,
        carrier_instructions,
        fuel_assumptions,
        accessorial_assumptions,
        required_pricing_format
      )
    `)
    .eq("invite_token", token)
    .single();

  if (inviteError || !invite) {
    notFound();
  }

  const rfp = Array.isArray(invite.rfps) ? invite.rfps[0] : invite.rfps;

  if (!rfp) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <SectionHeader
        title={`Carrier Invitation - ${rfp.name}`}
        description={`Invited Carrier: ${invite.carrier_name}`}
      />

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Mode
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {rfp.mode}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Bid Due Date
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {formatDate(rfp.bid_due_date)}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Status
            </p>
            <p className="mt-1">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {invite.status}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Carrier Instructions
          </h2>

          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
            {rfp.carrier_instructions ?? "No carrier instructions provided."}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Pricing Requirements
          </h2>

          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div>
              <span className="font-semibold text-slate-900">
                Required Format:
              </span>{" "}
              {rfp.required_pricing_format ?? "-"}
            </div>

            <div>
              <span className="font-semibold text-slate-900">
                Fuel Assumptions:
              </span>{" "}
              {rfp.fuel_assumptions ?? "-"}
            </div>

            <div>
              <span className="font-semibold text-slate-900">
                Accessorial Assumptions:
              </span>{" "}
              {rfp.accessorial_assumptions ?? "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Carrier Participation
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Accepting this invitation confirms your carrier intends to participate
          in this RFP event. Download the bid template, complete the required
          pricing fields, then submit your bid.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {invite.status !== "accepted" && (
            <form action={acceptInvite}>
              <input type="hidden" name="invite_id" value={invite.id} />
              <input type="hidden" name="rfp_id" value={rfp.id} />

              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Accept Invitation
              </button>
            </form>
          )}

          <Link
            href={`/carrier/invite/${token}/template`}
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
          >
            Download Bid Template
          </Link>

          <Link
            href={`/carrier/invite/${token}/upload`}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Submit Bid
          </Link>

          <Link
            href={`/carrier/invite/${token}/submissions`}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Upload History
          </Link>

          <Link
            href="/"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Return Home
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        Template download is now active. The next step is parsing uploaded carrier
        bid files and validating pricing by lane.
      </div>
    </div>
  );
}