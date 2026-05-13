import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

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
  carrier_bid_submissions:
    | {
        carrier_name: string | null;
        original_filename: string | null;
        status: string | null;
      }
    | {
        carrier_name: string | null;
        original_filename: string | null;
        status: string | null;
      }[]
    | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function getSubmission(error: ValidationErrorRow) {
  return Array.isArray(error.carrier_bid_submissions)
    ? error.carrier_bid_submissions[0]
    : error.carrier_bid_submissions;
}

function formatRawRow(rawRow: Record<string, unknown> | null) {
  if (!rawRow) return "-";

  return Object.entries(rawRow)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");
}

export default async function RfpValidationErrorsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, errorsResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, mode, status")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("carrier_bid_validation_errors")
      .select(`
        id,
        submission_id,
        rfp_id,
        invite_id,
        row_number,
        error_type,
        error_message,
        raw_row,
        created_at,
        carrier_bid_submissions (
          carrier_name,
          original_filename,
          status
        )
      `)
      .eq("rfp_id", rfpId)
      .order("created_at", { ascending: false }),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (errorsResult.error) {
    throw new Error(errorsResult.error.message);
  }

  const rfp = rfpResult.data;
  const validationErrors = (errorsResult.data ?? []) as unknown as ValidationErrorRow[];

  const errorTypeSummary = validationErrors.reduce<Record<string, number>>((summary, error) => {
    summary[error.error_type] = (summary[error.error_type] ?? 0) + 1;
    return summary;
  }, {});

  const uniqueSubmissionIds = new Set(
    validationErrors
      .map((error) => error.submission_id)
      .filter(Boolean)
  );

  return (
    <div>
      <SectionHeader
        title="Bid Validation Errors"
        description={`${rfp.name} - rejected or warning rows from carrier bid uploads`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to RFP
            </Link>

            <Link
              href={`/rfps/${rfp.id}/bids`}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Bid Responses
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Validation Errors</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {validationErrors.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Affected Uploads</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {uniqueSubmissionIds.size}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Error Types</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {Object.keys(errorTypeSummary).length}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        These rows were not imported into normalized bid pricing. They are intentionally isolated so bad carrier data does not pollute comparisons, award logic, or routing guides.
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Error Summary</h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Error Type</th>
              <th className="px-4 py-3">Count</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {Object.entries(errorTypeSummary).map(([errorType, count]) => (
              <tr key={errorType}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {errorType}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {count}
                </td>
              </tr>
            ))}

            {!Object.keys(errorTypeSummary).length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={2}>
                  No validation errors have been logged.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Rejected Rows</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use this table to explain upload issues back to carriers.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">CSV Row</th>
              <th className="px-4 py-3">Error Type</th>
              <th className="px-4 py-3">Message</th>
              <th className="px-4 py-3">Raw Row</th>
              <th className="px-4 py-3">Logged</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {validationErrors.map((error) => {
              const submission = getSubmission(error);

              return (
                <tr key={error.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {submission?.carrier_name ?? "-"}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {submission?.original_filename ?? "-"}
                  </td>

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
              );
            })}

            {!validationErrors.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={7}>
                  No rejected bid rows are available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}