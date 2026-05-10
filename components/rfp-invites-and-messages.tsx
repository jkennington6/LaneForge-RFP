import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { escapeHtml, getAppUrl, sendLaneForgeEmail } from "@/lib/email";

type AnyRow = Record<string, any>;

const allowedSenderRoles = new Set([
  "owner",
  "admin",
  "pricing_admin",
  "pricing_manager",
  "pricing_director",
  "pricing_analyst",
  "internal_user",
  "3pl_admin",
  "customer_admin",
  "shipper_admin",
]);

async function getActor() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  const supabase = createServiceSupabaseClient();

  const { data: user, error } = await supabase
    .from("platform_users")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (error || !user) {
    throw new Error("Your LaneForge platform user record was not found.");
  }

  if (user.status !== "active") {
    throw new Error("Your LaneForge account is not active.");
  }

  if (!allowedSenderRoles.has(user.platform_role)) {
    throw new Error("Your role cannot invite carriers or send bid messages.");
  }

  return user as AnyRow;
}

async function getRfpName(supabase: any, rfpId: string) {
  const { data } = await supabase.from("rfps").select("*").eq("id", rfpId).single();
  return data?.name || data?.title || data?.rfp_name || "LaneForge RFP";
}

async function getCarrierRecipients(supabase: any, carrierOrganizationId: string) {
  const { data: memberships, error: membershipError } = await supabase
    .from("platform_user_organizations")
    .select("platform_user_id")
    .eq("organization_id", carrierOrganizationId)
    .eq("status", "active");

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const userIds = (memberships || [])
    .map((row: AnyRow) => row.platform_user_id)
    .filter(Boolean);

  if (!userIds.length) {
    return [];
  }

  const { data: users, error: userError } = await supabase
    .from("platform_users")
    .select("id,email,status")
    .in("id", userIds)
    .eq("status", "active");

  if (userError) {
    throw new Error(userError.message);
  }

  return (users || []).filter((user: AnyRow) => Boolean(user.email));
}

async function logEmail(args: {
  supabase: any;
  rfpId: string;
  carrierOrganizationId?: string | null;
  inviteId?: string | null;
  messageId?: string | null;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  status: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  actorId?: string | null;
}) {
  await args.supabase.from("email_notifications").insert({
    rfp_id: args.rfpId,
    carrier_organization_id: args.carrierOrganizationId || null,
    invite_id: args.inviteId || null,
    message_id: args.messageId || null,
    recipient_email: args.recipientEmail,
    subject: args.subject,
    body_text: args.bodyText,
    provider: "resend",
    provider_message_id: args.providerMessageId || null,
    status: args.status,
    error_message: args.errorMessage || null,
    sent_at: args.status === "sent" || args.status === "dry_run" ? new Date().toISOString() : null,
    created_by_platform_user_id: args.actorId || null,
  });
}

async function sendInviteEmail({
  supabase,
  rfpId,
  carrierOrganizationId,
  inviteId,
  inviteMessage,
  actorId,
}: {
  supabase: any;
  rfpId: string;
  carrierOrganizationId: string;
  inviteId: string;
  inviteMessage: string;
  actorId: string;
}) {
  const rfpName = await getRfpName(supabase, rfpId);

  const { data: carrier } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", carrierOrganizationId)
    .single();

  const carrierName = carrier?.name || "Carrier";

  const recipients = await getCarrierRecipients(supabase, carrierOrganizationId);

  if (!recipients.length) {
    throw new Error(`${carrierName} has no active linked carrier users with email addresses.`);
  }

  const appUrl = getAppUrl();
  const carrierLink = `${appUrl}/carrier/rfps/${rfpId}`;

  const subject = `LaneForge RFP Invite: ${rfpName}`;
  const bodyText = [
    `You have been invited to bid on: ${rfpName}`,
    "",
    inviteMessage ? `Message: ${inviteMessage}` : "",
    "",
    `Open the bid here: ${carrierLink}`,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2>LaneForge RFP Invite</h2>
      <p>You have been invited to bid on <strong>${escapeHtml(rfpName)}</strong>.</p>
      ${
        inviteMessage
          ? `<p><strong>Message:</strong><br/>${escapeHtml(inviteMessage)}</p>`
          : ""
      }
      <p>
        <a href="${carrierLink}" style="display:inline-block;background:#020617;color:white;padding:12px 18px;border-radius:10px;text-decoration:none">
          Open RFP
        </a>
      </p>
    </div>
  `;

  for (const recipient of recipients) {
    const result = await sendLaneForgeEmail({
      to: recipient.email,
      subject,
      text: bodyText,
      html,
    });

    await logEmail({
      supabase,
      rfpId,
      carrierOrganizationId,
      inviteId,
      recipientEmail: recipient.email,
      subject,
      bodyText,
      status: result.dryRun ? "dry_run" : result.ok ? "sent" : "failed",
      providerMessageId: result.id || null,
      errorMessage: result.error || null,
      actorId,
    });
  }

  await supabase
    .from("rfp_carrier_invites")
    .update({
      last_sent_at: new Date().toISOString(),
      sent_count: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId);
}

export async function inviteCarrierToRfp(formData: FormData) {
  "use server";

  const actor = await getActor();
  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") || "");
  const carrierOrganizationId = String(formData.get("carrier_organization_id") || "");
  const inviteMessage = String(formData.get("invite_message") || "");

  if (!rfpId || !carrierOrganizationId) {
    throw new Error("RFP and carrier are required.");
  }

  const { data: invite, error } = await supabase
    .from("rfp_carrier_invites")
    .upsert(
      {
        rfp_id: rfpId,
        carrier_organization_id: carrierOrganizationId,
        invited_by_platform_user_id: actor.id,
        status: "invited",
        invite_message: inviteMessage,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "rfp_id,carrier_organization_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await sendInviteEmail({
    supabase,
    rfpId,
    carrierOrganizationId,
    inviteId: invite.id,
    inviteMessage,
    actorId: actor.id,
  });

  revalidatePath(`/rfps/${rfpId}`);
}

export async function resendCarrierInvite(formData: FormData) {
  "use server";

  const actor = await getActor();
  const supabase = createServiceSupabaseClient();

  const inviteId = String(formData.get("invite_id") || "");

  if (!inviteId) {
    throw new Error("Invite ID is required.");
  }

  const { data: invite, error } = await supabase
    .from("rfp_carrier_invites")
    .select("*")
    .eq("id", inviteId)
    .single();

  if (error || !invite) {
    throw new Error(error?.message || "Invite not found.");
  }

  await sendInviteEmail({
    supabase,
    rfpId: invite.rfp_id,
    carrierOrganizationId: invite.carrier_organization_id,
    inviteId: invite.id,
    inviteMessage: invite.invite_message || "",
    actorId: actor.id,
  });

  const nextCount = Number(invite.sent_count || 0) + 1;

  await supabase
    .from("rfp_carrier_invites")
    .update({
      sent_count: nextCount,
      last_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  revalidatePath(`/rfps/${invite.rfp_id}`);
}

export async function sendRfpBidMessage(formData: FormData) {
  "use server";

  const actor = await getActor();
  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") || "");
  const carrierOrganizationId = String(formData.get("carrier_organization_id") || "");
  const subject = String(formData.get("subject") || "");
  const message = String(formData.get("message") || "");

  if (!rfpId || !subject || !message) {
    throw new Error("RFP, subject, and message are required.");
  }

  let targetCarrierIds: string[] = [];

  if (carrierOrganizationId === "all_invited") {
    const { data: invites, error } = await supabase
      .from("rfp_carrier_invites")
      .select("carrier_organization_id")
      .eq("rfp_id", rfpId)
      .in("status", ["invited", "viewed", "submitted"]);

    if (error) {
      throw new Error(error.message);
    }

    targetCarrierIds = Array.from(
      new Set((invites || []).map((row: AnyRow) => row.carrier_organization_id).filter(Boolean))
    );
  } else {
    targetCarrierIds = [carrierOrganizationId].filter(Boolean);
  }

  if (!targetCarrierIds.length) {
    throw new Error("No carrier recipients found.");
  }

  const { data: bidMessage, error: messageError } = await supabase
    .from("rfp_bid_messages")
    .insert({
      rfp_id: rfpId,
      sent_by_platform_user_id: actor.id,
      audience: carrierOrganizationId === "all_invited" ? "all_invited_carriers" : "selected_carrier",
      carrier_organization_id: carrierOrganizationId === "all_invited" ? null : carrierOrganizationId,
      subject,
      message,
      sent_count: 0,
    })
    .select("*")
    .single();

  if (messageError) {
    throw new Error(messageError.message);
  }

  const appUrl = getAppUrl();
  const rfpName = await getRfpName(supabase, rfpId);
  const carrierLink = `${appUrl}/carrier/rfps/${rfpId}`;
  let totalSent = 0;

  for (const targetCarrierId of targetCarrierIds) {
    const recipients = await getCarrierRecipients(supabase, targetCarrierId);

    for (const recipient of recipients) {
      const bodyText = [
        `Message regarding: ${rfpName}`,
        "",
        message,
        "",
        `Open the bid here: ${carrierLink}`,
      ].join("\n");

      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2>${escapeHtml(subject)}</h2>
          <p><strong>RFP:</strong> ${escapeHtml(rfpName)}</p>
          <p>${escapeHtml(message).replaceAll("\n", "<br/>")}</p>
          <p>
            <a href="${carrierLink}" style="display:inline-block;background:#020617;color:white;padding:12px 18px;border-radius:10px;text-decoration:none">
              Open RFP
            </a>
          </p>
        </div>
      `;

      const result = await sendLaneForgeEmail({
        to: recipient.email,
        subject,
        text: bodyText,
        html,
      });

      await logEmail({
        supabase,
        rfpId,
        carrierOrganizationId: targetCarrierId,
        messageId: bidMessage.id,
        recipientEmail: recipient.email,
        subject,
        bodyText,
        status: result.dryRun ? "dry_run" : result.ok ? "sent" : "failed",
        providerMessageId: result.id || null,
        errorMessage: result.error || null,
        actorId: actor.id,
      });

      totalSent += 1;
    }
  }

  await supabase
    .from("rfp_bid_messages")
    .update({ sent_count: totalSent })
    .eq("id", bidMessage.id);

  revalidatePath(`/rfps/${rfpId}`);
}

export async function RfpInvitesAndMessages({ rfpId }: { rfpId: string }) {
  const supabase = createServiceSupabaseClient();

  const { data: carriers } = await supabase
    .from("organizations")
    .select("*")
    .eq("organization_type", "carrier")
    .eq("status", "active")
    .order("name", { ascending: true });

  const { data: invites } = await supabase
    .from("rfp_carrier_invites")
    .select("*")
    .eq("rfp_id", rfpId)
    .order("created_at", { ascending: false });

  const carrierIds = Array.from(
    new Set((invites || []).map((invite: AnyRow) => invite.carrier_organization_id).filter(Boolean))
  );

  const { data: invitedCarrierRows } = carrierIds.length
    ? await supabase.from("organizations").select("*").in("id", carrierIds)
    : { data: [] };

  const carrierById = new Map(
    (invitedCarrierRows || []).map((carrier: AnyRow) => [carrier.id, carrier])
  );

  const { data: messages } = await supabase
    .from("rfp_bid_messages")
    .select("*")
    .eq("rfp_id", rfpId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Carrier invites</h2>
        <p className="mt-1 text-sm text-slate-600">
          Invite linked carrier organizations to this RFP and resend notifications when needed.
        </p>

        <form action={inviteCarrierToRfp} className="mt-4 space-y-3">
          <input type="hidden" name="rfp_id" value={rfpId} />

          <select
            name="carrier_organization_id"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Select carrier
            </option>
            {(carriers || []).map((carrier: AnyRow) => (
              <option key={carrier.id} value={carrier.id}>
                {carrier.name}
              </option>
            ))}
          </select>

          <textarea
            name="invite_message"
            className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Optional message to carrier..."
          />

          <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            Invite carrier
          </button>
        </form>

        <div className="mt-5 space-y-3">
          {(invites || []).length ? (
            (invites || []).map((invite: AnyRow) => {
              const carrier = carrierById.get(invite.carrier_organization_id);

              return (
                <div
                  key={invite.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-950">
                      {carrier?.name || "Carrier"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Status: {invite.status} | Sent: {invite.sent_count || 0}
                      {invite.last_sent_at ? ` | Last sent: ${new Date(invite.last_sent_at).toLocaleString()}` : ""}
                    </p>
                  </div>

                  <form action={resendCarrierInvite}>
                    <input type="hidden" name="invite_id" value={invite.id} />
                    <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
                      Resend
                    </button>
                  </form>
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No carriers have been invited yet.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Bid messages</h2>
        <p className="mt-1 text-sm text-slate-600">
          Send follow-up messages, bid updates, deadline reminders, or revised instructions.
        </p>

        <form action={sendRfpBidMessage} className="mt-4 space-y-3">
          <input type="hidden" name="rfp_id" value={rfpId} />

          <select
            name="carrier_organization_id"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            defaultValue="all_invited"
          >
            <option value="all_invited">All invited carriers</option>
            {(invites || []).map((invite: AnyRow) => {
              const carrier = carrierById.get(invite.carrier_organization_id);

              return (
                <option key={invite.id} value={invite.carrier_organization_id}>
                  {carrier?.name || "Carrier"}
                </option>
              );
            })}
          </select>

          <input
            name="subject"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Subject"
          />

          <textarea
            name="message"
            required
            className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            placeholder="Message..."
          />

          <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            Send bid message
          </button>
        </form>

        <div className="mt-5 space-y-3">
          {(messages || []).length ? (
            (messages || []).map((message: AnyRow) => (
              <div key={message.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-slate-950">{message.subject}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Audience: {message.audience} | Sent: {message.sent_count || 0}
                </p>
                <p className="mt-2 whitespace-pre-line text-slate-600">{message.message}</p>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No bid messages sent yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
