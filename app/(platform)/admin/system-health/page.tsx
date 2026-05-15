import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type TableHealth = {
  label: string;
  table: string;
  count: number | null;
  status: "ok" | "error";
  detail: string;
  critical: boolean;
};

function statusClass(status: "ok" | "error") {
  if (status === "ok") return "border-green-200 bg-green-50 text-green-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function formatDate() {
  return new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function tableHealth(
  table: string,
  label: string,
  critical = true
): Promise<TableHealth> {
  try {
    const supabase = createServiceSupabaseClient();

    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      return {
        label,
        table,
        count: null,
        status: "error",
        detail: error.message,
        critical,
      };
    }

    return {
      label,
      table,
      count: count ?? 0,
      status: "ok",
      detail: "Reachable",
      critical,
    };
  } catch (error) {
    return {
      label,
      table,
      count: null,
      status: "error",
      detail: error instanceof Error ? error.message : "Unknown error",
      critical,
    };
  }
}

export default async function SystemHealthPage() {
  const checks = await Promise.all([
    tableHealth("rfps", "RFPs"),
    tableHealth("organizations", "Organizations"),
    tableHealth("customers", "Customers"),
    tableHealth("shipment_lanes", "Shipment Lanes"),
    tableHealth("rfp_carrier_invites", "Carrier Invites"),
    tableHealth("carrier_bid_submissions", "Carrier Bid Submissions"),
    tableHealth("carrier_bid_lane_rates", "Carrier Bid Lane Rates"),
    tableHealth("rfp_lane_awards", "Lane Awards"),
    tableHealth("rfp_customer_release_settings", "Customer Release Settings"),
    tableHealth("carrier_bid_validation_errors", "Bid Validation Errors", false),
    tableHealth("platform_users", "Platform Users", false),
  ]);

  const criticalErrors = checks.filter((check) => check.critical && check.status === "error");
  const warningErrors = checks.filter((check) => !check.critical && check.status === "error");
  const healthyChecks = checks.filter((check) => check.status === "ok");

  const overallStatus =
    criticalErrors.length > 0
      ? "Blocked"
      : warningErrors.length > 0
        ? "Needs Review"
        : "Healthy";

  const overallClass =
    criticalErrors.length > 0
      ? "border-red-200 bg-red-50 text-red-900"
      : warningErrors.length > 0
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-green-200 bg-green-50 text-green-900";

  return (
    <div>
      <SectionHeader
        title="System Health"
        description="Production database and service checks for LaneForge go-live stabilization."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/go-live"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Go-Live
            </Link>

            <Link
              href="/admin/test-links"
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              Test Links
            </Link>

            <Link
              href="/api/health"
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Health API
            </Link>
          </div>
        }
      />

      <section className={`mb-6 rounded-2xl border p-6 shadow-sm ${overallClass}`}>
        <p className="text-sm font-semibold uppercase tracking-wide">Overall Status</p>
        <h2 className="mt-2 text-4xl font-bold">{overallStatus}</h2>
        <p className="mt-2 text-sm">
          Last checked: {formatDate()}
        </p>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Healthy Checks</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{healthyChecks.length}</p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm text-red-700">Critical Errors</p>
          <p className="mt-2 text-2xl font-bold text-red-950">{criticalErrors.length}</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm text-amber-700">Warnings</p>
          <p className="mt-2 text-2xl font-bold text-amber-950">{warningErrors.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Checks</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{checks.length}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Database Table Health</h2>
          <p className="mt-1 text-sm text-slate-600">
            Any critical table error blocks go-live until corrected.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Table</th>
              <th className="px-4 py-3">Count</th>
              <th className="px-4 py-3">Critical</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Detail</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {checks.map((check) => (
              <tr key={check.table}>
                <td className="px-4 py-3 font-semibold text-slate-950">{check.label}</td>
                <td className="px-4 py-3 text-slate-600">{check.table}</td>
                <td className="px-4 py-3 text-slate-600">
                  {check.count === null ? "-" : check.count.toLocaleString("en-US")}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {check.critical ? "Yes" : "No"}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(check.status)}`}>
                    {check.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{check.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}