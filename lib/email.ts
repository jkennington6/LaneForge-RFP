import { Resend } from "resend";

type SendEmailArgs = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export async function sendLaneForgeEmail({
  to,
  subject,
  text,
  html,
}: SendEmailArgs) {
  const recipients = Array.isArray(to) ? to : [to];
  const from = process.env.EMAIL_FROM || "LaneForge <notifications@laneforge.org>";
  const dryRun = process.env.EMAIL_DRY_RUN === "true" || !process.env.RESEND_API_KEY;

  if (dryRun) {
    console.log("[EMAIL DRY RUN]", {
      from,
      to: recipients,
      subject,
      text,
    });

    return {
      ok: true,
      dryRun: true,
      id: "dry-run",
    };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from,
    to: recipients,
    subject,
    text,
    html,
  });

  if (error) {
    return {
      ok: false,
      error: JSON.stringify(error),
    };
  }

  return {
    ok: true,
    id: data?.id,
  };
}

export function getAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
