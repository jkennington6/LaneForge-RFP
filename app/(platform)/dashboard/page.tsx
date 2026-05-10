import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { carriers, comparisonRows, customers, rfps } from "@/lib/demo-data";
import { formatCurrency } from "@/lib/utils";
import { Building2, FileSpreadsheet, Route, Truck } from "lucide-react";

export default function DashboardPage() {
  const totalSavings = comparisonRows.reduce((sum, row) => sum + row.annualSavings, 0);

  return (
    <div>
      <SectionHeader title="Dashboard" description="Live SaaS command center for RFP events, customer activity, carrier submissions, and award progress." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Active RFPs" value={String(rfps.filter((r) => r.status === "Active").length)} helper="Events currently accepting carrier responses" icon={FileSpreadsheet} />
        <KpiCard title="Customers" value={String(customers.length)} helper="Customer organizations in the platform" icon={Building2} />
        <KpiCard title="Carriers" value={String(carriers.length)} helper="Carrier organizations available for invites" icon={Truck} />
        <KpiCard title="Modeled Savings" value={formatCurrency(totalSavings)} helper="Based on demo bid comparison lanes" icon={Route} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">RFP Status</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">RFP</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Submissions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rfps.map((rfp) => (
                  <tr key={rfp.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{rfp.name}</td>
                    <td className="px-4 py-3 text-slate-600">{rfp.dueDate}</td>
                    <td className="px-4 py-3"><StatusBadge variant={rfp.status === "Active" ? "active" : "draft"}>{rfp.status}</StatusBadge></td>
                    <td className="px-4 py-3 text-slate-600">{rfp.submitted}/{rfp.invited}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Top Award Candidates</h2>
          <div className="mt-4 space-y-3">
            {comparisonRows.slice(0, 5).map((row) => (
              <div key={`${row.lane}-${row.zip3Lane}`} className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                <div>
                  <div className="font-semibold text-slate-950">{row.lane} · {row.zip3Lane}</div>
                  <div className="text-sm text-slate-500">Primary: {row.primaryCarrier} · Backup: {row.secondCarrier}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-emerald-700">{formatCurrency(row.annualSavings)}</div>
                  <div className="text-xs text-slate-500">modeled savings</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
