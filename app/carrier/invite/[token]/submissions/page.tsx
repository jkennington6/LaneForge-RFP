import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/supabase";

type SubmissionRow = {
  id: string;
  rfp_id: string;
  invite_id: string | null;
  carrier_name: string;
  submitted_by_email: string | null;
  original_filename: string | null;
  status: string;
  uploaded_at: string;
  processed_at: string | null;
  notes: string | null;
};

type ValidationErrorRow = {
  id: string;
  submission_id: string | null;
  rfp_id: string;
  invite_id: string | null;
  row_number: number | null;
  error_type: string;
  error_message: string;
  raw_row: Record<string, unknown> | null;
  created_at: string;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatRawRow(rawRow: Record<string, unknown> | null) {
  if (!rawRow) return "-";

  return Object.entries(rawRow)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("processed") && !normalized.includes("error")) {
    return "bg-green-50 text-green-700";
  }

  if (normalized.includes("error") || normalized.includes("failed")) {
    return "bg-red-50 text-red-700";
  }

  if (normalized.includes("processing")) {
    return "bg-blue-50 text-blue-700";
  }

  return "bg-slate-100 text-slate-700";
}

export default async function CarrierSubmissionHistoryPage({
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
      contact_email,
      status,
      invite_token,
      rfps (
        id,
        name,
        mode,
        bid_due_date
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

  const [submissionsResult, errorsResult] = await Promise.all([
    supabase
      .from("carrier_bid_submissions")
      .select(
        "id, rfp_id, invite_id, carrier_name, submitted_by_email, original_filename, status, uploaded_at, processed_at, notes"
      )
      .eq("invite_id", invite.id)
      .order("uploaded_at", { ascending: false }),

    supabase
      .from("carrier_bid_validation_errors")
      .select(
        "id, submission_id, rfp_id, invite_id, row_number, error_type, error_message, raw_row, created_at"
      )
      .eq("invite_id", invite.id)
      .order("created_at", { ascending: false }),
  ]);

  if (submissionsResult.error) {
    throw new Error(submissionsResult.error.message);
  }

  if (errorsResult.error) {
    throw new Error(errorsResult.error.message);
  }

  const submissions = (submissionsResult.data ?? []) as SubmissionRow[];
  const validationErrors = (errorsResult.data ?? []) as ValidationErrorRow[];

  const errorsBySubmission = validationErrors.reduce<Record<string, number>>((summary, error) => {
    const key = error.submission_id ?? "unknown";
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/carrier/invite/${token}`}
          className="text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          Back to invite
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-slate-950">
          Upload History - {rfp.name}
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Carrier: {invite.carrier_name}
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Uploads</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {submissions.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Validation Errors</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {validationErrors.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Current Invite Status</p>
          <p className="mt-2">
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(invite.status)}`}>
              {invite.status}
            </span>
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        If your upload has validation errors, correct the rows in the CSV template and upload the revised file.
        Invalid rows are not used in comparisons or routing guide recommendations.
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
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
          Upload Revised Bid
        </Link>

        <Link
          href={`/carrier/invite/${token}/submissions/errors/export`}
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
        >
          Download Error CSV
        </Link>
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Bid Uploads</h2>
          <p className="mt-1 text-sm text-slate-600">
            Each file upload is tracked separately.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Errors</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3">Processed</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {submissions.map((submission) => (
              <tr key={submission.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {submission.original_filename ?? "-"}
                </td>

                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(submission.status)}`}>
                    {submission.status}
                  </span>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {errorsBySubmission[submission.id] ?? 0}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {formatDate(submission.uploaded_at)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {formatDate(submission.processed_at)}
                </td>
              </tr>
            ))}

            {!submissions.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No bid uploads have been submitted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Validation Errors</h2>
          <p className="mt-1 text-sm text-slate-600">
            These rows were rejected and were not imported into the bid comparison engine.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">CSV Row</th>
              <th className="px-4 py-3">Error Type</th>
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Raw Row</th>
              <th className="px-4 py-3">Logged</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {validationErrors.map((error) => (
              <tr key={error.id}>
                <td className="px-4 py-3 text-slate-600">
                  {error.row_number ?? "-"}
                </td>

                <td className="px-4 py-3">
                  <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                    {error.error_type}
                  </span>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {error.error_message}
                </td>

                <td className="max-w-xl px-4 py-3 text-xs text-slate-500">
                  {formatRawRow(error.raw_row)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {formatDate(error.created_at)}
                </td>
              </tr>
            ))}

            {!validationErrors.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No validation errors are currently logged for this invite.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}