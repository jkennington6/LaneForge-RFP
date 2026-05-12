import Link from "next/link";
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
  uploaded_at: string;
  processed_at: string | null;
  notes: string | null;
};

type RateRow = {
  id: string;
  submission_id: string;
  rfp_id: string;
  lane_id: string | null;
  origin_zip: string | null;
  destination_zip: string | null;
  origin_state: string | null;
  destination_state: string | null;
  lane_state_pair: string | null;
  weight_break: string | null;
  freight_class: string | null;
  discount: number | null;
  minimum_charge: number | null;
  rate_per_lb: number | null;
  accessorial_charge: number | null;
  transit_days: number | null;
  notes: string | null;
  carrier_bid_submissions?:
    | {
        carrier_name: string;
        original_filename: string | null;
      }
    | {
        carrier_name: string;
        original_filename: string | null;
      }[]
    | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${value}%`;
}

export default async function RfpBidsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, submissionsResult, ratesResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, mode, status, bid_due_date")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("carrier_bid_submissions")
      .select(
        "id, rfp_id, invite_id, carrier_name, submitted_by_email, original_filename, status, uploaded_at, processed_at, notes"
      )
      .eq("rfp_id", rfpId)
      .order("uploaded_at", { ascending: false }),

    supabase
      .from("carrier_bid_lane_rates")
      .select(`
        id,
        submission_id,
        rfp_id,
        lane_id,
        origin_zip,
        destination_zip,
        origin_state,
        destination_state,
        lane_state_pair,
        weight_break,
        freight_class,
        discount,
        minimum_charge,
        rate_per_lb,
        accessorial_charge,
        transit_days,
        notes,
        carrier_bid_submissions (
          carrier_name,
          original_filename
        )
      `)
      .eq("rfp_id", rfpId)
      .order("lane_state_pair", { ascending: true }),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (submissionsResult.error) {
    throw new Error(submissionsResult.error.message);
  }

  if (ratesResult.error) {
    throw new Error(ratesResult.error.message);
  }

  const rfp = rfpResult.data;
  const submissions = (submissionsResult.data ?? []) as SubmissionRow[];
  const rates = (ratesResult.data ?? []) as unknown as RateRow[];

  const uniqueCarriers = new Set(submissions.map((submission) => submission.carrier_name));
  const pricedRows = rates.filter(
    (rate) =>
      rate.discount !== null ||
      rate.minimum_charge !== null ||
      rate.rate_per_lb !== null
  );

  return (
    <div>
      <SectionHeader
        title="Bid Responses"
        description={`${rfp.name} - ${rfp.mode} - ${rfp.status}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to RFP
            </Link>

            <Link
              href={`/rfps/${rfp.id}/invites`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Carrier Invites
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Submissions</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{submissions.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Carriers</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{uniqueCarriers.size}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Imported Bid Rows</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{rates.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Priced Rows</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{pricedRows.length}</p>
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Carrier Submissions</h2>
          <p className="mt-1 text-sm text-slate-600">
            Each upload creates a submission header. The normalized lane pricing rows appear below.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Submitted By</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3">Processed</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {submissions.map((submission) => (
              <tr key={submission.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {submission.carrier_name}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {submission.submitted_by_email ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {submission.original_filename ?? "-"}
                </td>

                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {submission.status}
                  </span>
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
                <td className="px-4 py-6 text-slate-500" colSpan={6}>
                  No carrier bid submissions have been uploaded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Normalized Lane Rates</h2>
          <p className="mt-1 text-sm text-slate-600">
            This table is the normalized pricing layer used later for comparison, award logic, routing guides, and analytics.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Origin ZIP</th>
              <th className="px-4 py-3">Dest ZIP</th>
              <th className="px-4 py-3">Break</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Min</th>
              <th className="px-4 py-3">Rate/LB</th>
              <th className="px-4 py-3">Accessorial</th>
              <th className="px-4 py-3">Transit</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {rates.map((rate) => (
              <tr key={rate.id}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {Array.isArray(rate.carrier_bid_submissions)
                    ? rate.carrier_bid_submissions[0]?.carrier_name ?? "-"
                    : rate.carrier_bid_submissions?.carrier_name ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {rate.lane_state_pair ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {rate.origin_zip ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {rate.destination_zip ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {rate.weight_break ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {rate.freight_class ?? "-"}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {pct(rate.discount)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(rate.minimum_charge)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(rate.rate_per_lb)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {money(rate.accessorial_charge)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {rate.transit_days ?? "-"}
                </td>
              </tr>
            ))}

            {!rates.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={11}>
                  No normalized lane rates have been imported yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}