import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { CountBarChart } from "@/components/analytics-charts";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AnyRow = Record<string, any>;

type CarrierCoverage = {
  carrierName: string;
  activeSubmissionCount: number;
  pricedLaneCount: number;
  totalRateRows: number;
  coveragePercent: number;
  status: string;
};

type StatePairCoverage = {
  laneStatePair: string;
  laneCount: number;
  carrierOptionCount: number;
  rateRowCount: number;
};

function getSubmission(rate: AnyRow) {
  return Array.isArray(rate.carrier_bid_submissions)
    ? rate.carrier_bid_submissions[0]
    : rate.carrier_bid_submissions;
}

function getCarrierName(rate: AnyRow) {
  const submission = getSubmission(rate);
  return String(submission?.carrier_name ?? rate.carrier_name ?? "Unknown Carrier");
}

function isActiveRate(rate: AnyRow) {
  const submission = getSubmission(rate);
  return submission?.is_active !== false;
}

function matchesLane(rate: AnyRow, lane: AnyRow) {
  if (rate.lane_id && lane.id && String(rate.lane_id) === String(lane.id)) return true;

  const originZipMatch =
    rate.origin_zip &&
    lane.origin_zip &&
    String(rate.origin_zip).trim() === String(lane.origin_zip).trim();

  const destinationZipMatch =
    rate.destination_zip &&
    lane.destination_zip &&
    String(rate.destination_zip).trim() === String(lane.destination_zip).trim();

  const weightBreakMatch =
    !rate.weight_break ||
    !lane.weight_break ||
    String(rate.weight_break).trim() === String(lane.weight_break).trim();

  const classMatch =
    !rate.freight_class ||
    !lane.freight_class ||
    String(rate.freight_class).trim() === String(lane.freight_class).trim();

  return Boolean(originZipMatch && destinationZipMatch && weightBreakMatch && classMatch);
}

function percent(value: number) {
  if (!Number.isFinite(value)) return "0.0%";

  return value.toLocaleString("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function coverageClass(value: number) {
  if (value >= 0.9) return "bg-green-50 text-green-700";
  if (value >= 0.5) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function laneName(lane: AnyRow) {
  return `${lane.lane_state_pair ?? "Lane"} - ${lane.origin_zip ?? "-"} to ${lane.destination_zip ?? "-"}`;
}

export default async function BidCoverageAnalyticsPage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, lanesResult, ratesResult, submissionsResult, invitesResult] =
    await Promise.all([
      supabase
        .from("rfps")
        .select("id, name, mode, status")
        .eq("id", rfpId)
        .is("deleted_at", null)
        .single(),

      supabase
        .from("shipment_lanes")
        .select("*")
        .eq("rfp_id", rfpId),

      supabase
        .from("carrier_bid_lane_rates")
        .select(`
          *,
          carrier_bid_submissions (
            carrier_name,
            is_active
          )
        `)
        .eq("rfp_id", rfpId),

      supabase
        .from("carrier_bid_submissions")
        .select("id, carrier_name, status, is_active")
        .eq("rfp_id", rfpId),

      supabase
        .from("rfp_carrier_invites")
        .select("id, carrier_name, status")
        .eq("rfp_id", rfpId),
    ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (lanesResult.error) throw new Error(lanesResult.error.message);
  if (ratesResult.error) throw new Error(ratesResult.error.message);
  if (submissionsResult.error) throw new Error(submissionsResult.error.message);
  if (invitesResult.error) throw new Error(invitesResult.error.message);

  const rfp = rfpResult.data;
  const lanes = (lanesResult.data ?? []) as AnyRow[];
  const rates = ((ratesResult.data ?? []) as AnyRow[]).filter(isActiveRate);
  const submissions = (submissionsResult.data ?? []) as AnyRow[];
  const invites = (invitesResult.data ?? []) as AnyRow[];

  const carrierNames = Array.from(
    new Set([
      ...invites.map((invite) => String(invite.carrier_name ?? "").trim()).filter(Boolean),
      ...submissions.map((submission) => String(submission.carrier_name ?? "").trim()).filter(Boolean),
      ...rates.map((rate) => getCarrierName(rate)).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const carrierCoverage: CarrierCoverage[] = carrierNames
    .map((carrierName) => {
      const carrierRates = rates.filter((rate) => getCarrierName(rate) === carrierName);
      const carrierSubmissions = submissions.filter(
        (submission) => String(submission.carrier_name ?? "") === carrierName && submission.is_active
      );

      const pricedLaneIds = new Set<string>();

      lanes.forEach((lane) => {
        if (carrierRates.some((rate) => matchesLane(rate, lane))) {
          pricedLaneIds.add(String(lane.id));
        }
      });

      const coveragePercent =
        lanes.length > 0 ? pricedLaneIds.size / lanes.length : 0;

      return {
        carrierName,
        activeSubmissionCount: carrierSubmissions.length,
        pricedLaneCount: pricedLaneIds.size,
        totalRateRows: carrierRates.length,
        coveragePercent,
        status:
          coveragePercent >= 0.9
            ? "Strong"
            : coveragePercent >= 0.5
              ? "Partial"
              : "Low",
      };
    })
    .sort((a, b) => b.coveragePercent - a.coveragePercent);

  const laneCoverageRows = lanes.map((lane) => {
    const matchingRates = rates.filter((rate) => matchesLane(rate, lane));
    const matchingCarriers = Array.from(
      new Set(matchingRates.map((rate) => getCarrierName(rate)))
    ).sort((a, b) => a.localeCompare(b));

    return {
      lane,
      carrierCount: matchingCarriers.length,
      rateRowCount: matchingRates.length,
      carriers: matchingCarriers,
    };
  });

  const statePairCoverageMap = new Map<string, StatePairCoverage>();

  laneCoverageRows.forEach((row) => {
    const laneStatePair = String(row.lane.lane_state_pair ?? "Unknown");

    const existing =
      statePairCoverageMap.get(laneStatePair) ??
      {
        laneStatePair,
        laneCount: 0,
        carrierOptionCount: 0,
        rateRowCount: 0,
      };

    existing.laneCount += 1;
    existing.carrierOptionCount += row.carrierCount;
    existing.rateRowCount += row.rateRowCount;

    statePairCoverageMap.set(laneStatePair, existing);
  });

  const statePairCoverage = Array.from(statePairCoverageMap.values()).sort(
    (a, b) =>
      a.carrierOptionCount / Math.max(1, a.laneCount) -
      b.carrierOptionCount / Math.max(1, b.laneCount)
  );

  const lowCoverageLanes = laneCoverageRows
    .filter((row) => row.carrierCount <= 1)
    .sort((a, b) => a.carrierCount - b.carrierCount)
    .slice(0, 50);

  const averageCarrierOptions =
    lanes.length > 0
      ? laneCoverageRows.reduce((sum, row) => sum + row.carrierCount, 0) / lanes.length
      : 0;

  const noBidLaneCount = laneCoverageRows.filter((row) => row.carrierCount === 0).length;
  const oneCarrierLaneCount = laneCoverageRows.filter((row) => row.carrierCount === 1).length;

  return (
    <div>
      <SectionHeader
        title="Bid Coverage Analytics"
        description={`${rfp.name} - carrier participation, lane coverage, and no-bid risk`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}/analytics`}
              className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2 text-sm font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
            >
              Analytics
            </Link>

            <Link
              href={`/rfps/${rfp.id}/analytics/geography`}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Geography
            </Link>

            <Link
              href={`/rfps/${rfp.id}/analytics/risk`}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
            >
              Risk
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
          <p className="text-sm text-slate-500">Invited Carriers</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{invites.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active Submissions</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {submissions.filter((submission) => submission.is_active).length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Avg Carrier Options / Lane</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {averageCarrierOptions.toFixed(1)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">No-Bid / One-Carrier Lanes</p>
          <p className="mt-2 text-2xl font-bold text-red-700">
            {noBidLaneCount} / {oneCarrierLaneCount}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <CountBarChart
          title="Priced Lanes by Carrier"
          description="How many lanes each carrier appears to have priced."
          data={carrierCoverage.map((carrier) => ({
            label: carrier.carrierName,
            value: carrier.pricedLaneCount,
            detail: `${percent(carrier.coveragePercent)} coverage - ${carrier.totalRateRows} rate row(s)`,
          }))}
        />

        <CountBarChart
          title="Rate Rows by Carrier"
          description="Total submitted rate rows by carrier."
          data={carrierCoverage.map((carrier) => ({
            label: carrier.carrierName,
            value: carrier.totalRateRows,
            detail: `${carrier.pricedLaneCount} priced lane(s)`,
          }))}
        />

        <CountBarChart
          title="Lowest Coverage State Pairs"
          description="State pairs with the fewest average carrier options."
          data={statePairCoverage.slice(0, 12).map((row) => ({
            label: row.laneStatePair,
            value: Number((row.carrierOptionCount / Math.max(1, row.laneCount)).toFixed(1)),
            detail: `${row.laneCount} lane(s), ${row.rateRowCount} rate row(s)`,
          }))}
        />
      </div>
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Carrier Coverage
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Percent of shipment lanes each carrier appears to have priced.
          </p>
        </div>

        <div className="divide-y divide-slate-200">
          {carrierCoverage.map((carrier) => (
            <div key={carrier.carrierName} className="p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{carrier.carrierName}</p>
                  <p className="text-sm text-slate-600">
                    {carrier.pricedLaneCount} of {lanes.length} lane(s) priced - {carrier.totalRateRows} rate row(s)
                  </p>
                </div>

                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${coverageClass(carrier.coveragePercent)}`}>
                  {carrier.status} - {percent(carrier.coveragePercent)}
                </span>
              </div>

              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className="h-3 rounded-full bg-slate-900"
                  style={{ width: `${Math.round(carrier.coveragePercent * 100)}%` }}
                />
              </div>
            </div>
          ))}

          {!carrierCoverage.length && (
            <div className="p-6 text-sm text-slate-600">
              No carrier coverage data is available yet.
            </div>
          )}
        </div>
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <CountBarChart
          title="Priced Lanes by Carrier"
          description="How many lanes each carrier appears to have priced."
          data={carrierCoverage.map((carrier) => ({
            label: carrier.carrierName,
            value: carrier.pricedLaneCount,
            detail: `${percent(carrier.coveragePercent)} coverage - ${carrier.totalRateRows} rate row(s)`,
          }))}
        />

        <CountBarChart
          title="Rate Rows by Carrier"
          description="Total submitted rate rows by carrier."
          data={carrierCoverage.map((carrier) => ({
            label: carrier.carrierName,
            value: carrier.totalRateRows,
            detail: `${carrier.pricedLaneCount} priced lane(s)`,
          }))}
        />

        <CountBarChart
          title="Lowest Coverage State Pairs"
          description="State pairs with the fewest average carrier options."
          data={statePairCoverage.slice(0, 12).map((row) => ({
            label: row.laneStatePair,
            value: Number((row.carrierOptionCount / Math.max(1, row.laneCount)).toFixed(1)),
            detail: `${row.laneCount} lane(s), ${row.rateRowCount} rate row(s)`,
          }))}
        />
      </div>
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            State-Pair Coverage
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Lowest average carrier option count by state pair.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">State Pair</th>
              <th className="px-4 py-3">Lanes</th>
              <th className="px-4 py-3">Avg Carrier Options</th>
              <th className="px-4 py-3">Rate Rows</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {statePairCoverage.slice(0, 50).map((row) => (
              <tr key={row.laneStatePair}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {row.laneStatePair}
                </td>

                <td className="px-4 py-3 text-slate-600">{row.laneCount}</td>

                <td className="px-4 py-3 text-slate-600">
                  {(row.carrierOptionCount / Math.max(1, row.laneCount)).toFixed(1)}
                </td>

                <td className="px-4 py-3 text-slate-600">{row.rateRowCount}</td>
              </tr>
            ))}

            {!statePairCoverage.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={4}>
                  No state-pair coverage data is available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
        <div className="border-b border-red-200 bg-red-50 p-5">
          <h2 className="text-lg font-semibold text-red-950">
            Low Coverage Lanes
          </h2>
          <p className="mt-1 text-sm text-red-800">
            Lanes with zero or one carrier option should be reviewed before award.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Carrier Options</th>
              <th className="px-4 py-3">Carriers</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {lowCoverageLanes.map((row) => (
              <tr key={String(row.lane.id)}>
                <td className="px-4 py-3 font-semibold text-slate-950">
                  {laneName(row.lane)}
                </td>

                <td className="px-4 py-3 font-semibold text-red-700">
                  {row.carrierCount}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {row.carriers.length ? row.carriers.join(", ") : "No priced carriers"}
                </td>
              </tr>
            ))}

            {!lowCoverageLanes.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={3}>
                  No low-coverage lanes are currently identified.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}