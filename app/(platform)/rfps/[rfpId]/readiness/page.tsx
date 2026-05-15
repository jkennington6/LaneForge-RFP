import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type CheckStatus = "pass" | "warn" | "fail";

type ReadinessCheck = {
  category: string;
  title: string;
  detail: string;
  status: CheckStatus;
};

function statusClass(status: CheckStatus) {
  if (status === "pass") return "bg-green-50 text-green-700 border-green-200";
  if (status === "warn") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
}

function statusLabel(status: CheckStatus) {
  if (status === "pass") return "Pass";
  if (status === "warn") return "Warning";
  return "Needs Work";
}

function moneyNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return moneyNumber(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export default async function RfpReadinessPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [
    rfpResult,
    lanesResult,
    invitesResult,
    submissionsResult,
    validationErrorsResult,
    awardsResult,
    releaseResult,
  ] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, mode, status, bid_due_date")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("shipment_lanes")
      .select("*")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_carrier_invites")
      .select("id, carrier_name, status, created_at")
      .eq("rfp_id", rfpId),

    supabase
      .from("carrier_bid_submissions")
      .select("id, carrier_name, status, is_active, submission_version, uploaded_at")
      .eq("rfp_id", rfpId),

    supabase
      .from("carrier_bid_validation_errors")
      .select("id, error_type, created_at")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_lane_awards")
      .select("*")
      .eq("rfp_id", rfpId),

    supabase
      .from("rfp_customer_release_settings")
      .select("*")
      .eq("rfp_id", rfpId)
      .maybeSingle(),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (invitesResult.error) throw new Error(invitesResult.error.message);
  if (submissionsResult.error) throw new Error(submissionsResult.error.message);
  if (validationErrorsResult.error) throw new Error(validationErrorsResult.error.message);
  if (awardsResult.error) throw new Error(awardsResult.error.message);
  if (releaseResult.error) throw new Error(releaseResult.error.message);

  const rfp = rfpResult.data;
  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const invites = (invitesResult.data ?? []) as AnyRow[];
  const submissions = (submissionsResult.data ?? []) as AnyRow[];
  const validationErrors = (validationErrorsResult.data ?? []) as AnyRow[];
  const awards = (awardsResult.data ?? []) as AnyRow[];
  const releaseSettings = releaseResult.data as AnyRow | null;

  const activeSubmissions = submissions.filter((submission) => submission.is_active);
  const submittedInvites = invites.filter((invite) =>
    String(invite.status ?? "").toLowerCase().includes("submitted")
  );

  const awardedLaneIds = new Set(
    awards
      .filter((award) => award.primary_rate_id || award.primary_carrier_name)
      .map((award) => String(award.lane_id))
  );

  const totalHistoricalSpend = lanes.reduce(
    (sum, lane) => sum + moneyNumber(lane.historical_spend),
    0
  );

  const totalAwardedCost = awards.reduce(
    (sum, award) => sum + moneyNumber(award.primary_estimated_cost),
    0
  );

  const releasedAnything = Boolean(
    releaseSettings?.show_carrier_names ||
      releaseSettings?.show_bid_amounts ||
      releaseSettings?.show_savings ||
      releaseSettings?.show_comparisons ||
      releaseSettings?.show_routing_guide ||
      releaseSettings?.show_award_recommendation
  );

  const checks: ReadinessCheck[] = [
    {
      category: "RFP Setup",
      title: "Shipment lanes loaded",
      detail:
        lanes.length > 0
          ? `${lanes.length} shipment lane(s) are loaded.`
          : "No shipment lanes are loaded. Upload lane data before running the RFP.",
      status: lanes.length > 0 ? "pass" : "fail",
    },
    {
      category: "Carrier Participation",
      title: "Carrier invites created",
      detail:
        invites.length > 0
          ? `${invites.length} carrier invite(s) exist.`
          : "No carrier invites exist yet.",
      status: invites.length > 0 ? "pass" : "fail",
    },
    {
      category: "Carrier Participation",
      title: "Carrier bids received",
      detail:
        activeSubmissions.length > 0
          ? `${activeSubmissions.length} active carrier bid submission(s) are available.`
          : "No active carrier bid submissions are available.",
      status: activeSubmissions.length > 0 ? "pass" : "fail",
    },
    {
      category: "Bid Quality",
      title: "Bid validation errors",
      detail:
        validationErrors.length === 0
          ? "No validation errors are currently logged."
          : `${validationErrors.length} validation error(s) are logged and should be reviewed.`,
      status: validationErrors.length === 0 ? "pass" : "warn",
    },
    {
      category: "Bid Quality",
      title: "Submitted invite coverage",
      detail:
        invites.length > 0
          ? `${submittedInvites.length} of ${invites.length} invite(s) have submitted or submitted-with-errors status.`
          : "No invites available to measure submitted coverage.",
      status:
        invites.length === 0
          ? "fail"
          : submittedInvites.length === invites.length
            ? "pass"
            : submittedInvites.length > 0
              ? "warn"
              : "fail",
    },
    {
      category: "Awarding",
      title: "Formal awards generated",
      detail:
        awardedLaneIds.size > 0
          ? `${awardedLaneIds.size} of ${lanes.length} lane(s) have a primary award.`
          : "No formal lane awards are saved yet.",
      status:
        lanes.length > 0 && awardedLaneIds.size === lanes.length
          ? "pass"
          : awardedLaneIds.size > 0
            ? "warn"
            : "fail",
    },
    {
      category: "Awarding",
      title: "Award cost summary",
      detail:
        totalAwardedCost > 0
          ? `Awarded cost is ${money(totalAwardedCost)} versus historical spend of ${money(totalHistoricalSpend)}.`
          : "Awarded cost is not available yet.",
      status: totalAwardedCost > 0 ? "pass" : "warn",
    },
    {
      category: "Customer Release",
      title: "Release settings exist",
      detail: releaseSettings
        ? "Customer release settings are configured."
        : "Customer release settings have not been configured yet.",
      status: releaseSettings ? "pass" : "warn",
    },
    {
      category: "Customer Release",
      title: "Customer visibility controlled",
      detail: releasedAnything
        ? "At least one customer-facing visibility option is enabled."
        : "Customer-facing visibility is currently locked down.",
      status: releasedAnything ? "warn" : "pass",
    },
    {
      category: "Customer Release",
      title: "Awards released only after awards exist",
      detail:
        releaseSettings?.show_award_recommendation && awardedLaneIds.size === 0
          ? "Award recommendations are released, but no formal awards exist."
          : "Award release setting is consistent with current award data.",
      status:
        releaseSettings?.show_award_recommendation && awardedLaneIds.size === 0
          ? "fail"
          : "pass",
    },
  ];

  const passCount = checks.filter((check) => check.status === "pass").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const failCount = checks.filter((check) => check.status === "fail").length;
  const readinessScore = Math.round((passCount / checks.length) * 100);

  return (
    <div>
      <SectionHeader
        title="RFP Readiness"
        description={`${rfp.name} - operational checklist before customer release or final award presentation`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}/readiness/export`}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
            >
              Download Readiness CSV
            </Link>

            <Link
              href={`/rfps/${rfp.id}/customer-release`}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Customer Release
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

      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Readiness Score</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{readinessScore}%</p>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-slate-900"
              style={{ width: `${readinessScore}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Passed</p>
          <p className="mt-2 text-2xl font-bold text-green-700">{passCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Warnings</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">{warnCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Needs Work</p>
          <p className="mt-2 text-2xl font-bold text-red-700">{failCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Awarded Lanes</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {awardedLaneIds.size}/{lanes.length}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Use this page before sending customer-facing outputs. A warning does not always mean the RFP is blocked, but any failed item should be reviewed before release.
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Checklist</h2>
          <p className="mt-1 text-sm text-slate-600">
            Pass/fail checks based on current RFP data.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Check</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {checks.map((check) => (
              <tr key={`${check.category}-${check.title}`}>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(check.status)}`}>
                    {statusLabel(check.status)}
                  </span>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {check.category}
                </td>

                <td className="px-4 py-3 font-semibold text-slate-950">
                  {check.title}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {check.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}