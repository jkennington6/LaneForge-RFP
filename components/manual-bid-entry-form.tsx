"use client";

import { useMemo, useState } from "react";

type Option = {
  value: string;
  label: string;
};

type ManualBidEntryFormProps = {
  laneOptions: Option[];
  carrierOptions: Option[];
  action: (formData: FormData) => Promise<void>;
};

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ManualBidEntryForm({
  laneOptions,
  carrierOptions,
  action,
}: ManualBidEntryFormProps) {
  const [linehaul, setLinehaul] = useState("");
  const [fuel, setFuel] = useState("");
  const [accessorials, setAccessorials] = useState("");
  const [additionalCost, setAdditionalCost] = useState("");

  const totalCost = useMemo(() => {
    return (
      toNumber(linehaul) +
      toNumber(fuel) +
      toNumber(accessorials) +
      toNumber(additionalCost)
    );
  }, [linehaul, fuel, accessorials, additionalCost]);

  const disabled = !laneOptions.length || !carrierOptions.length;

  return (
    <form
      action={action}
      className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-950">Enter carrier bid</h2>

      {!laneOptions.length && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You need at least one shipment lane before entering bids.
        </div>
      )}

      {!carrierOptions.length && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You need at least one active carrier before entering bids.
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          RFP / Lane
          <select
            name="lane_selection"
            required
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select RFP lane</option>
            {laneOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          Carrier
          <select
            name="carrier_id"
            required
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select carrier</option>
            {carrierOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Linehaul
          <input
            name="linehaul"
            type="number"
            step="0.01"
            value={linehaul}
            onChange={(event) => setLinehaul(event.target.value)}
            placeholder="500.00"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Fuel
          <input
            name="fuel"
            type="number"
            step="0.01"
            value={fuel}
            onChange={(event) => setFuel(event.target.value)}
            placeholder="120.00"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Accessorials
          <input
            name="accessorials"
            type="number"
            step="0.01"
            value={accessorials}
            onChange={(event) => setAccessorials(event.target.value)}
            placeholder="45.00"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Additional cost
          <input
            name="additional_cost"
            type="number"
            step="0.01"
            value={additionalCost}
            onChange={(event) => setAdditionalCost(event.target.value)}
            placeholder="Other carrier cost"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Total cost
          <input
            name="total_cost"
            readOnly
            value={totalCost.toFixed(2)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950"
          />
        </label>

        <label className="text-sm font-medium text-slate-700">
          Service days
          <input
            name="service_days"
            type="number"
            step="1"
            placeholder="2"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          Notes
          <textarea
            name="notes"
            placeholder="Transit notes, exclusions, rate assumptions, minimum charge notes, etc."
            className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={disabled || totalCost <= 0}
        className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        Save bid line
      </button>
    </form>
  );
}
