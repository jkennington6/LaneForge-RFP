"use client";

type ChartDatum = {
  label: string;
  value: number;
  detail?: string;
};

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("en-US");
}

function cleanValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function barWidth(value: number, maxAbsValue: number) {
  if (maxAbsValue <= 0) return 0;
  return Math.max(4, Math.round((Math.abs(value) / maxAbsValue) * 100));
}

function valueClass(value: number) {
  if (value > 0) return "text-green-700";
  if (value < 0) return "text-red-700";
  return "text-slate-600";
}

export function MoneyBarChart({
  title,
  description,
  data,
  emptyMessage = "No chart data is available yet.",
}: {
  title: string;
  description: string;
  data: ChartDatum[];
  emptyMessage?: string;
}) {
  const cleaned = data
    .map((item) => ({
      ...item,
      value: cleanValue(item.value),
    }))
    .filter((item) => item.label)
    .slice(0, 12);

  const maxValue = Math.max(1, ...cleaned.map((item) => Math.abs(item.value)));

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      <div className="space-y-4 p-5">
        {cleaned.map((item) => {
          const width = barWidth(item.value, maxValue);

          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">
                    {item.label}
                  </p>
                  {item.detail && (
                    <p className="truncate text-xs text-slate-500">
                      {item.detail}
                    </p>
                  )}
                </div>

                <p className={`shrink-0 font-semibold ${valueClass(item.value)}`}>
                  {formatMoney(item.value)}
                </p>
              </div>

              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className={item.value >= 0 ? "h-3 rounded-full bg-slate-900" : "h-3 rounded-full bg-red-700"}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}

        {!cleaned.length && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            {emptyMessage}
          </div>
        )}
      </div>
    </section>
  );
}

export function CountBarChart({
  title,
  description,
  data,
  emptyMessage = "No chart data is available yet.",
}: {
  title: string;
  description: string;
  data: ChartDatum[];
  emptyMessage?: string;
}) {
  const cleaned = data
    .map((item) => ({
      ...item,
      value: cleanValue(item.value),
    }))
    .filter((item) => item.label)
    .slice(0, 12);

  const maxValue = Math.max(1, ...cleaned.map((item) => Math.abs(item.value)));

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      <div className="space-y-4 p-5">
        {cleaned.map((item) => {
          const width = barWidth(item.value, maxValue);

          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">
                    {item.label}
                  </p>
                  {item.detail && (
                    <p className="truncate text-xs text-slate-500">
                      {item.detail}
                    </p>
                  )}
                </div>

                <p className="shrink-0 font-semibold text-slate-950">
                  {formatNumber(item.value)}
                </p>
              </div>

              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className="h-3 rounded-full bg-slate-900"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}

        {!cleaned.length && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            {emptyMessage}
          </div>
        )}
      </div>
    </section>
  );
}

export function AnalyticsDonut({
  title,
  description,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  primaryValue: number;
  secondaryLabel: string;
  secondaryValue: number;
}) {
  const primary = Math.max(0, cleanValue(primaryValue));
  const secondary = Math.max(0, cleanValue(secondaryValue));
  const total = primary + secondary;
  const percent = total > 0 ? primary / total : 0;
  const circumference = 2 * Math.PI * 42;
  const dash = circumference * percent;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>

          <div className="mt-5 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-slate-900" />
              <span className="text-slate-600">{primaryLabel}</span>
              <span className="font-semibold text-slate-950">
                {formatNumber(primary)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-slate-200" />
              <span className="text-slate-600">{secondaryLabel}</span>
              <span className="font-semibold text-slate-950">
                {formatNumber(secondary)}
              </span>
            </div>
          </div>
        </div>

        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              className="text-slate-200"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              className="text-slate-900"
            />
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-slate-950">
              {(percent * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}