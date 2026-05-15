import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type ActivityRow = {
  id: string;
  timestamp: string;
  category: string;
  title: string;
  detail: string;
  status?: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function categoryClass(category: string) {
  if (category === "Bid Upload") return "bg-blue-50 text-blue-700";
  if (category === "Validation") return "bg-red-50 text-red-700";
  if (category === "Customer Release") return "bg-green-50 text-green-700";
  if (category === "Award") return "bg-indigo-50 text-indigo-700";

  return "bg-slate-100 text-slate-700";
}

function statusClass(status: string | null | undefined) {
  const normalized = String(status ?? "").toLowerCase();

  if (normalized.includes("active") || normalized.includes("processed") || normalized.includes("approved") || normalized.includes("released")) {
    return "bg-green-50 text-green-700";
  }

  if (normalized.includes("error") || normalized.includes("failed")) {
    return "bg-red-50 text-red-700";
  }

  if (normalized.includes("draft") || normalized.includes("review")) {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-slate-100 text-slate-700";
}

export default async function RfpActivityPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [
    rfpResult,
    submissionsResult,
    validationErrorsResult,
    releaseEventsResult,
    awardsResult,
  ] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, mode, status")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("carrier_bid_submissions")
      .select(
        "id, carrier_name, original_filename, status, submission_version, is_active, uploaded_at, processed_at"
      )
      .eq("rfp_id", rfpId),

    supabase
      .from("carrier_bid_validation_errors")
      .select("id, row_number, error_type, error_message, created_at")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_customer_release_events")
      .select("id, action, preset, notes, created_at")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_lane_awards")
      .select("id, lane_id, primary_carrier_name, award_status, created_at, updated_at")
      .eq("rfp_id", rfpId),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (submissionsResult.error) {
    throw new Error(submissionsResult.error.message);
  }

  if (validationErrorsResult.error) {
    throw new Error(validationErrorsResult.error.message);
  }

  if (releaseEventsResult.error) {
    throw new Error(releaseEventsResult.error.message);
  }

  if (awardsResult.error) {
    throw new Error(awardsResult.error.message);
  }

  const rfp = rfpResult.data;
  const submissions = (submissionsResult.data ?? []) as AnyRow[];
  const validationErrors = (validationErrorsResult.data ?? []) as AnyRow[];
  const releaseEvents = (releaseEventsResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];

  const activityRows: ActivityRow[] = [
    ...submissions.map((submission) => ({
      id: `submission-${submission.id}`,
      timestamp: submission.uploaded_at ?? submission.processed_at ?? "",
      category: "Bid Upload",
      title: `${submission.carrier_name ?? "Carrier"} uploaded bid v${submission.submission_version ?? 1}`,
      detail: `${submission.original_filename ?? "No filename"}${submission.is_active ? " - active submission" : " - superseded/inactive"}`,
      status: submission.status ?? null,
    })),

    ...validationErrors.map((error) => ({
      id: `validation-${error.id}`,
      timestamp: error.created_at ?? "",
      category: "Validation",
      title: `Validation issue: ${error.error_type ?? "unknown"}`,
      detail: `CSV row ${error.row_number ?? "-"} - ${error.error_message ?? ""}`,
      status: "error",
    })),

    ...releaseEvents.map((event) => ({
      id: `release-${event.id}`,
      timestamp: event.created_at ?? "",
      category: "Customer Release",
      title:
        event.action === "preset_apply"
          ? `Release preset applied: ${event.preset ?? "unknown"}`
          : event.action === "restore_snapshot"
            ? "Customer release settings restored"
            : "Customer release settings saved",
      detail: event.notes ?? "-",
      status: event.action ?? null,
    })),

    ...awards.map((award) => ({
      id: `award-${award.id}`,
      timestamp: award.updated_at ?? award.created_at ?? "",
      category: "Award",
      title: award.primary_carrier_name
        ? `Lane awarded to ${award.primary_carrier_name}`
        : "Award decision updated",
      detail: `Lane ID: ${award.lane_id ?? "-"} - Status: ${award.award_status ?? "draft"}`,
      status: award.award_status ?? null,
    })),
  ].sort((a, b) => {
    const bTime = new Date(b.timestamp).getTime();
    const aTime = new Date(a.timestamp).getTime();

    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });

  const bidUploadCount = submissions.length;
  const validationErrorCount = validationErrors.length;
  const releaseEventCount = releaseEvents.length;
  const awardCount = awards.length;

  return (
    <div>
      <SectionHeader
        title="RFP Activity"
        description={`${rfp.name} - timeline of bid uploads, validation issues, release actions, and awards`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}/activity/export`}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
            >
              Download Activity CSV
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

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Bid Uploads</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{bidUploadCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Validation Errors</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{validationErrorCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Release Events</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{releaseEventCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Award Records</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{awardCount}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Timeline</h2>
          <p className="mt-1 text-sm text-slate-600">
            Most recent activity first.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Activity</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {activityRows.slice(0, 250).map((activity) => (
              <tr key={activity.id}>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(activity.timestamp)}
                </td>

                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${categoryClass(activity.category)}`}>
                    {activity.category}
                  </span>
                </td>

                <td className="px-4 py-3 font-semibold text-slate-950">
                  {activity.title}
                </td>

                <td className="max-w-xl px-4 py-3 text-slate-600">
                  {activity.detail}
                </td>

                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(activity.status)}`}>
                    {activity.status ?? "-"}
                  </span>
                </td>
              </tr>
            ))}

            {!activityRows.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  No activity is available for this RFP yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {activityRows.length > 250 && (
          <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            Showing first 250 activity records of {activityRows.length}. Use the CSV export for the full timeline.
          </div>
        )}
      </div>
    </div>
  );
}