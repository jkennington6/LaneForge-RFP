import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";

export default function CarrierPortalPage() {
  return (
    <div>
      <SectionHeader title="Carrier Portal" description="Invite-only carrier workspace for bid details, templates, response uploads, and submission status." />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-950">Better Earth Packaging 2026 LTL RFP</h2>
              <p className="mt-1 text-sm text-slate-500">Due June 12, 2026 · LTL · FAK 92.5 assumption</p>
            </div>
            <StatusBadge variant="active">Open</StatusBadge>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <button className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100"><div className="font-semibold">Download template</div><p className="mt-1 text-sm text-slate-500">Carrier-ready XLSX/CSV bid sheet.</p></button>
            <button className="rounded-xl border border-dashed border-slate-300 p-4 text-left hover:bg-slate-50"><div className="font-semibold">Upload response</div><p className="mt-1 text-sm text-slate-500">Validate columns, rates, mins, service days.</p></button>
            <button className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100"><div className="font-semibold">Edit before deadline</div><p className="mt-1 text-sm text-slate-500">Replace previous submission until locked.</p></button>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">Submission Status</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex justify-between"><span>Template downloaded</span><StatusBadge variant="success">Yes</StatusBadge></div>
            <div className="flex justify-between"><span>Response uploaded</span><StatusBadge variant="warning">Pending</StatusBadge></div>
            <div className="flex justify-between"><span>Validation issues</span><StatusBadge variant="neutral">0</StatusBadge></div>
            <div className="flex justify-between"><span>Competitor visibility</span><StatusBadge variant="danger">Blocked</StatusBadge></div>
          </div>
        </section>
      </div>
    </div>
  );
}
