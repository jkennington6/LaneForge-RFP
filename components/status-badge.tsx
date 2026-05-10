import { cn } from "@/lib/utils";

type Variant = "active" | "draft" | "closed" | "warning" | "success" | "danger" | "neutral";

const styles: Record<Variant, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  draft: "bg-slate-100 text-slate-700 ring-slate-600/20",
  closed: "bg-zinc-100 text-zinc-700 ring-zinc-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  success: "bg-green-50 text-green-700 ring-green-600/20",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/20",
  neutral: "bg-blue-50 text-blue-700 ring-blue-600/20"
};

export function StatusBadge({ children, variant = "neutral" }: { children: React.ReactNode; variant?: Variant }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", styles[variant])}>{children}</span>;
}
