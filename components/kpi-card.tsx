import { LucideIcon } from "lucide-react";

export function KpiCard({ title, value, helper, icon: Icon }: { title: string; value: string; helper: string; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">{helper}</p>
    </div>
  );
}
