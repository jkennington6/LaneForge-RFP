import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type SubmissionRow = {
  id: string;
  rfp_id: string;
  invite_id: string | null;
  carrier_name: string;
  submitted_by_email: string | null;
  original_filename: string | null;
  status: string;
  submission_version: number;
  is_active: boolean;
  uploaded_at: string;
  processed_at: string | null;
  superseded_at: string | null;
};

type CountRow = {
  submission_id: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusClass(status: string, isActive: boolean) {
  if (isActive) return "bg-green-50 text-green-700";

  const normalized = status.toLowerCase();

  if (normalized.includes("failed") || normalized.includes("error")) {
    return "bg-red-50 text-red-700";
  }

  if (normalized.includes("processed")) {
    return "bg-blue-50 text-blue-700";
  }

  return "bg-slate-100 text-slate-700";
}

async function activateSubmission(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") ?? "").trim();
  const submissionId = String(formData.get("submission_id") ?? "").trim();

  if (!rfpId || !submissionId) {
    throw new Error("RFP ID and submission ID are required.");
  }

  const { data: submission, error: submissionError } = await supabase
    .from("carrier_bid_submissions")
    .select("id, rfp_id, invite_id, status")
    .eq("id", submissionId)
    .eq("rfp_id", rfpId)
    .single();

  if (submissionError || !submission) {
    throw new Error(submissionError?.message ?? "Submission not found.");
  }

  if (!submission.invite_id) {
    throw new Error("Submission is not connected to an invite.");
  }

  const { count: laneRateCount, error: laneRateCountError } = await supabase
    .from("carrier_bid_lane_rates")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submissionId)
    .eq("rfp_id", rfpId);

  if (laneRateCountError) {
    throw new Error(laneRateCountError.message);
  }

  if (!laneRateCount || laneRateCount < 1) {
    throw new Error("This submission has no valid imported bid rows and cannot be activated.");
  }

  const now = new Date().toISOString();

  const { error: deactivateError } = await supabase
    .from("carrier_bid_submissions")
    .update({
      is_active: false,
      superseded_at: now,
      superseded_by_submission_id: submissionId,
    })
    .eq("invite_id", submission.invite_id)
    .neq("id", submissionId);

  if (deactivateError) {
    throw new Error(deactivateError.message);
  }

  const { error: activateError } = await supabase
    .from("carrier_bid_submissions")
    .update({
      is_active: true,
      superseded_at: null,
      superseded_by_submission_id: null,
    })
    .eq("id", submissionId);

  if (activateError) {
    throw new Error(activateError.message);
  }

  const inviteStatus =
    submission.status === "processed_with_errors"
      ? "submitted_with_errors"
      : "submitted";

  const { error: inviteError } = await supabase
    .from("rfp_carrier_invites")
    .update({
      status: inviteStatus,
      updated_at: now,
    })
    .eq("id", submission.invite_id);

  if (inviteError) {
    throw new Error(inviteError.message);
  }

  revalidatePath(`/rfps/${rfpId}/bids/manage`);
  revalidatePath(`/rfps/${rfpId}/bids`);
  revalidatePath(`/rfps/${rfpId}/comparisons`);
  revalidatePath(`/rfps/${rfpId}/routing-guide`);
}

export default async function ManageBidVersionsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, submissionsResult, laneRatesResult, errorsResult] =
    await Promise.all([
      supabase
        .from("rfps")
        .select("id, name, mode, status")
        .eq("id", rfpId)
        .is("deleted_at", null)
        .single(),

      supabase
        .from("carrier_bid_submissions")
        .select(
          "id, rfp_id, invite_id, carrier_name, submitted_by_email, original_filename, status, submission_version, is_active, uploaded_at, processed_at, superseded_at"
        )
        .eq("rfp_id", rfpId)
        .order("carrier_name", { ascending: true })
        .order("submission_version", { ascending: false }),

      supabase
        .from("carrier_bid_lane_rates")
        .select("submission_id")
        .eq("rfp_id", rfpId),

      supabase
        .from("carrier_bid_validation_errors")
        .select("submission_id")
        .eq("rfp_id", rfpId),
    ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (submissionsResult.error) {
    throw new Error(submissionsResult.error.message);
  }

  if (laneRatesResult.error) {
    throw new Error(laneRatesResult.error.message);
  }

  if (errorsResult.error) {
    throw new Error(errorsResult.error.message);
  }

  const rfp = rfpResult.data;
  const submissions = (submissionsResult.data ?? []) as SubmissionRow[];
  const laneRates = (laneRatesResult.data ?? []) as CountRow[];
  const validationErrors = (errorsResult.data ?? []) as CountRow[];

  const laneRateCounts = laneRates.reduce<Record<string, number>>((summary, row) => {
    const key = String(row.submission_id ?? "");
    if (!key) return summary;

    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});

  const errorCounts = validationErrors.reduce<Record<string, number>>((summary, row) => {
    const key = String(row.submission_id ?? "");
    if (!key) return summary;

    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});

  const activeSubmissions = submissions.filter((submission) => submission.is_active);

  return (
    <div>
      <SectionHeader
        title="Manage Bid Versions"
        description={`${rfp.name} - choose which carrier upload version is active`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}/bids`}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Bid Responses
            </Link>

            <Link
              href={`/rfps/${rfp.id}/comparisons`}
              className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
            >
              Comparisons
            </Link>

            <Link
              href={`/rfps/${rfp.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to RFP
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Submissions</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {submissions.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active Submissions</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {activeSubmissions.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Superseded Submissions</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {submissions.length - activeSubmissions.length}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Only active submissions are used in comparisons, routing guides, and exports.
        Use this page when a carrier resubmits a file and you need to manually choose the correct version.
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Carrier Submission Versions
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Activate a prior version only when you intentionally want to override the latest valid submission.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Valid Rows</th>
              <th className="px-4 py-3">Errors</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {submissions.map((submission) => {
              const validRowCount = laneRateCounts[submission.id] ?? 0;
              const errorCount = errorCounts[submission.id] ?? 0;
              const canActivate = !submission.is_active && validRowCount > 0;

              return (
                <tr key={submission.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {submission.carrier_name}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    v{submission.submission_version ?? 1}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {submission.original_filename ?? "-"}
                  </td>

                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(submission.status, false)}`}>
                      {submission.status}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(submission.status, submission.is_active)}`}>
                      {submission.is_active ? "Active" : "Superseded"}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {validRowCount}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {errorCount}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(submission.uploaded_at)}
                  </td>

                  <td className="px-4 py-3">
                    {canActivate ? (
                      <form action={activateSubmission}>
                        <input type="hidden" name="rfp_id" value={rfp.id} />
                        <input type="hidden" name="submission_id" value={submission.id} />

                        <button
                          type="submit"
                          className="rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
                        >
                          Make Active
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {submission.is_active ? "Current" : "No valid rows"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {!submissions.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={9}>
                  No bid submissions are available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}