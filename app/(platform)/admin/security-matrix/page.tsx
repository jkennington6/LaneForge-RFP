import Link from "next/link";
import { SectionHeader } from "@/components/section-header";

export const dynamic = "force-dynamic";

type MatrixRow = {
  role: string;
  routeOrFeature: string;
  expectedAccess: "allow" | "deny" | "released-only";
  reason: string;
  priority: "critical" | "high" | "medium";
};

function accessClass(value: MatrixRow["expectedAccess"]) {
  if (value === "allow") return "border-green-200 bg-green-50 text-green-800";
  if (value === "released-only") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function priorityClass(value: MatrixRow["priority"]) {
  if (value === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (value === "high") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function SecurityMatrixPage() {
  const rows: MatrixRow[] = [
    {
      role: "Platform Owner",
      routeOrFeature: "All internal RFPs, customers, carriers, admin pages",
      expectedAccess: "allow",
      reason: "Owner must be able to support and administer the full platform.",
      priority: "critical",
    },
    {
      role: "Platform Owner",
      routeOrFeature: "User suspension/admin access controls",
      expectedAccess: "allow",
      reason: "Owner needs emergency access control before beta.",
      priority: "critical",
    },
    {
      role: "3PL User",
      routeOrFeature: "RFPs controlled by their 3PL organization",
      expectedAccess: "allow",
      reason: "3PL manages RFP process for its controlled customers.",
      priority: "critical",
    },
    {
      role: "3PL User",
      routeOrFeature: "Customer release settings",
      expectedAccess: "allow",
      reason: "3PL controls what its customer can see.",
      priority: "critical",
    },
    {
      role: "Direct Customer",
      routeOrFeature: "Own customer RFP package",
      expectedAccess: "released-only",
      reason: "Customer should see only its own customer-safe RFP package.",
      priority: "critical",
    },
    {
      role: "Direct Customer",
      routeOrFeature: "Raw carrier bid amounts",
      expectedAccess: "released-only",
      reason: "Bid amounts should only show if explicitly released.",
      priority: "critical",
    },
    {
      role: "Direct Customer",
      routeOrFeature: "Savings analytics",
      expectedAccess: "released-only",
      reason: "Savings should only show if explicitly released.",
      priority: "critical",
    },
    {
      role: "3PL-Controlled Customer",
      routeOrFeature: "RFP package released by managing 3PL",
      expectedAccess: "released-only",
      reason: "The managing 3PL should control visibility.",
      priority: "critical",
    },
    {
      role: "3PL-Controlled Customer",
      routeOrFeature: "Other customer RFPs",
      expectedAccess: "deny",
      reason: "Customer data must remain isolated.",
      priority: "critical",
    },
    {
      role: "Carrier",
      routeOrFeature: "Invited RFP submission route",
      expectedAccess: "allow",
      reason: "Carrier can access RFPs they are invited to bid.",
      priority: "critical",
    },
    {
      role: "Carrier",
      routeOrFeature: "Other carrier bids",
      expectedAccess: "deny",
      reason: "Competitor bid data must never be visible.",
      priority: "critical",
    },
    {
      role: "Carrier",
      routeOrFeature: "Customer savings and award analytics",
      expectedAccess: "deny",
      reason: "Carrier should not see customer/3PL analytics.",
      priority: "critical",
    },
    {
      role: "Suspended User",
      routeOrFeature: "Any protected workflow",
      expectedAccess: "deny",
      reason: "Suspension must block access quickly.",
      priority: "high",
    },
  ];

  const roleGroups = Array.from(new Set(rows.map((row) => row.role)));

  return (
    <div>
      <SectionHeader
        title="Role and Security Matrix"
        description="Manual go-live testing plan for customer, carrier, 3PL, and platform-owner visibility."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/go-live" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Go-Live
            </Link>
            <Link href="/admin/test-links" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
              Test Links
            </Link>
            <Link href="/admin/rfp-visibility" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              RFP Visibility
            </Link>
          </div>
        }
      />

      <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 shadow-sm">
        <h2 className="font-semibold text-red-950">Go-live rule</h2>
        <p className="mt-1">
          Any failed critical deny/released-only test blocks beta. Customer and carrier isolation is more important than adding another dashboard.
        </p>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-5">
        {roleGroups.map((role) => (
          <div key={role} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{role}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {rows.filter((row) => row.role === role).length}
            </p>
            <p className="mt-1 text-xs text-slate-500">security checks</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Security Test Matrix</h2>
          <p className="mt-1 text-sm text-slate-600">
            Log in as each role and verify every expected access result.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Route / Feature</th>
                <th className="px-4 py-3">Expected</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {rows.map((row) => (
                <tr key={`${row.role}-${row.routeOrFeature}`}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{row.role}</td>
                  <td className="px-4 py-3 text-slate-700">{row.routeOrFeature}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${accessClass(row.expectedAccess)}`}>
                      {row.expectedAccess}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${priorityClass(row.priority)}`}>
                      {row.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}