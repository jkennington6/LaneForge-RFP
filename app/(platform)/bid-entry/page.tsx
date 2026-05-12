import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import Link from "next/link";
import { CsvDownloadButton } from "@/components/csv-download-button";
import { SectionHeader } from "@/components/section-header";
import { ManualBidEntryForm } from "@/components/manual-bid-entry-form";
import { createServiceSupabaseClient } from "@/lib/supabase";

type RfpRow = {
  id: string;
  name: string;
};

type LaneRow = {
  id: string;
  rfp_id: string;
  lane_state_pair: string | null;
  origin_city: string | null;
  origin_state: string | null;
  origin_zip: string | null;
  destination_city: string | null;
  destination_state: string | null;
  destination_zip: string | null;
  weight_break: string | null;
  freight_class: string | null;
  shipment_count: number;
};

type CarrierRow = {
  id: string;
  organization_id: string;
  scac: string | null;
  inactive: boolean;
  is_excluded: boolean;
};

type OrganizationRow = {
  id: string;
  name: string;
};

type BidLineRow = {
  id: string;
  rfp_id: string;
  shipment_lane_id: string;
  carrier_id: string;
  linehaul: number | null;
  fuel: number | null;
  accessorials: number | null;
  additional_cost: number | null;
  total_cost: number;
  service_days: number | null;
  notes: string | null;
  no_bid: boolean | null;
  no_bid_reason: string | null;
  source_filename: string | null;
  source_type: string | null;
  created_at: string;
};

type CsvRow = Record<string, string>;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text: string) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });
}

function getCsvValue(row: CsvRow, ...keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    if (row[normalized] !== undefined) {
      return String(row[normalized] ?? "").trim();
    }
  }

  return "";
}

function csvBool(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["yes", "y", "true", "1", "no bid", "nobid"].includes(normalized);
}

function toNumber(value: FormDataEntryValue | string | null) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const parsed = Number(raw.replace(/[$,]/g, ""));

  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

async function createManualBidLine(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const laneSelection = String(formData.get("lane_selection") ?? "").trim();
  const carrierId = String(formData.get("carrier_id") ?? "").trim();

  const linehaul = toNumber(formData.get("linehaul"));
  const fuel = toNumber(formData.get("fuel"));
  const accessorials = toNumber(formData.get("accessorials"));
  const additionalCost = toNumber(formData.get("additional_cost"));
  const serviceDays = toNumber(formData.get("service_days"));
  const notes = String(formData.get("notes") ?? "").trim();

  const totalCost =
    Number(linehaul ?? 0) +
    Number(fuel ?? 0) +
    Number(accessorials ?? 0) +
    Number(additionalCost ?? 0);

  const [rfpId, shipmentLaneId] = laneSelection.split("|");

  if (!rfpId || !shipmentLaneId) {
    throw new Error("RFP lane selection is required.");
  }

  if (!carrierId) {
    throw new Error("Carrier is required.");
  }

  if (totalCost <= 0) {
    throw new Error("Total cost must be greater than zero.");
  }

  const { error } = await supabase.from("manual_bid_lines").insert({
    id: randomUUID(),
    rfp_id: rfpId,
    shipment_lane_id: shipmentLaneId,
    carrier_id: carrierId,
    linehaul,
    fuel,
    accessorials,
    additional_cost: additionalCost,
    total_cost: totalCost,
    service_days: serviceDays,
    notes: notes || null,
    no_bid: false,
    source_type: "manual",
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/bid-entry");
  revalidatePath("/comparisons");
  revalidatePath("/routing-guides");
  revalidatePath(`/rfps/${rfpId}`);
}

async function importCarrierBidCsv(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") ?? "").trim();
  const carrierId = String(formData.get("carrier_id") ?? "").trim();
  const file = formData.get("bid_file");

  if (!rfpId) {
    throw new Error("RFP is required.");
  }

  if (!carrierId) {
    throw new Error("Carrier is required.");
  }

  if (!file || typeof file === "string" || typeof file.text !== "function") {
    throw new Error("CSV file is required.");
  }

  const fileText = await file.text();
  const rows = parseCsv(fileText);

  if (!rows.length) {
    throw new Error("The CSV did not contain any rows.");
  }

  const [lanesResult, existingBidsResult] = await Promise.all([
    supabase
      .from("shipment_lanes")
      .select("id, rfp_id")
      .eq("rfp_id", rfpId),

    supabase
      .from("manual_bid_lines")
      .select("id, shipment_lane_id, carrier_id")
      .eq("rfp_id", rfpId)
      .eq("carrier_id", carrierId),
  ]);

  if (lanesResult.error || existingBidsResult.error) {
    throw new Error(lanesResult.error?.message ?? existingBidsResult.error?.message);
  }

  const validLaneIds = new Set((lanesResult.data ?? []).map((lane) => lane.id));
  const existingLaneIds = new Set(
    (existingBidsResult.data ?? []).map((bid) => bid.shipment_lane_id)
  );

  const seenLaneIds = new Set<string>();
  const errors: string[] = [];
  const inserts: any[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    const laneId = getCsvValue(row, "lane_id", "shipment_lane_id");
    const noBid = csvBool(getCsvValue(row, "no_bid", "no bid"));
    const noBidReason = getCsvValue(row, "no_bid_reason", "no bid reason");

    if (!laneId) {
      errors.push(`Row ${rowNumber}: lane_id is required.`);
      return;
    }

    if (!validLaneIds.has(laneId)) {
      errors.push(`Row ${rowNumber}: lane_id does not belong to the selected RFP.`);
      return;
    }

    if (seenLaneIds.has(laneId)) {
      errors.push(`Row ${rowNumber}: duplicate lane_id in this CSV.`);
      return;
    }

    if (existingLaneIds.has(laneId)) {
      errors.push(`Row ${rowNumber}: this carrier already has a bid for this lane.`);
      return;
    }

    seenLaneIds.add(laneId);

    if (noBid) {
      return;
    }

    const linehaul = toNumber(getCsvValue(row, "linehaul", "line haul"));
    const fuel = toNumber(getCsvValue(row, "fuel", "fuel_surcharge", "fsc"));
    const accessorials = toNumber(getCsvValue(row, "accessorials", "accessorial"));
    const additionalCost = toNumber(getCsvValue(row, "additional_cost", "additional cost", "other_cost"));
    const serviceDays = toNumber(getCsvValue(row, "service_days", "service days", "transit_days"));
    const notes = getCsvValue(row, "notes", "carrier_notes");

    const totalCost =
      Number(linehaul ?? 0) +
      Number(fuel ?? 0) +
      Number(accessorials ?? 0) +
      Number(additionalCost ?? 0);

    if (totalCost <= 0) {
      errors.push(`Row ${rowNumber}: total calculated cost must be greater than zero unless no_bid is Yes.`);
      return;
    }

    inserts.push({
      id: randomUUID(),
      rfp_id: rfpId,
      shipment_lane_id: laneId,
      carrier_id: carrierId,
      linehaul,
      fuel,
      accessorials,
      additional_cost: additionalCost,
      total_cost: totalCost,
      service_days: serviceDays,
      notes: notes || null,
      no_bid: false,
      no_bid_reason: noBidReason || null,
      source_filename: file.name,
      source_type: "csv",
    });
  });

  if (errors.length) {
    throw new Error(`CSV validation failed: ${errors.slice(0, 15).join(" | ")}`);
  }

  if (!inserts.length) {
    throw new Error("No priced bid rows were imported. If all rows are no-bid, there is nothing to rank yet.");
  }

  const { error } = await supabase.from("manual_bid_lines").insert(inserts);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/bid-entry");
  revalidatePath("/comparisons");
  revalidatePath("/routing-guides");
  revalidatePath(`/rfps/${rfpId}`);
}

export default async function BidEntryPage() {
  const supabase = createServiceSupabaseClient();

  const [
    rfpsResult,
    lanesResult,
    carriersResult,
    organizationsResult,
    bidLinesResult,
  ] = await Promise.all([
    supabase.from("rfps").select("id, name").order("created_at", { ascending: false }),

    supabase
      .from("shipment_lanes")
      .select(
        "id, rfp_id, lane_state_pair, origin_city, origin_state, origin_zip, destination_city, destination_state, destination_zip, weight_break, freight_class, shipment_count"
      )
      .order("lane_state_pair", { ascending: true }),

    supabase
      .from("carriers")
      .select("id, organization_id, scac, inactive, is_excluded")
      .order("scac", { ascending: true }),

    supabase
      .from("organizations")
      .select("id, name"),

    supabase
      .from("manual_bid_lines")
      .select(
        "id, rfp_id, shipment_lane_id, carrier_id, linehaul, fuel, accessorials, additional_cost, total_cost, service_days, notes, no_bid, no_bid_reason, source_filename, source_type, created_at"
      )
      .order("created_at", { ascending: false }),
  ]);

  if (
    rfpsResult.error ||
    lanesResult.error ||
    carriersResult.error ||
    organizationsResult.error ||
    bidLinesResult.error
  ) {
    return (
      <div>
        <SectionHeader
          title="Manual Bid Entry"
          description="Enter carrier bid costs by RFP, lane, and carrier."
        />

        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Supabase error:{" "}
          {rfpsResult.error?.message ??
            lanesResult.error?.message ??
            carriersResult.error?.message ??
            organizationsResult.error?.message ??
            bidLinesResult.error?.message}
        </div>
      </div>
    );
  }

  const rfps = (rfpsResult.data ?? []) as RfpRow[];
  const lanes = (lanesResult.data ?? []) as LaneRow[];
  const carriers = (carriersResult.data ?? []) as CarrierRow[];
  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];
  const bidLines = (bidLinesResult.data ?? []) as BidLineRow[];

  const rfpById = new Map(rfps.map((rfp) => [rfp.id, rfp]));
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const orgById = new Map(organizations.map((org) => [org.id, org]));
  const carrierById = new Map(carriers.map((carrier) => [carrier.id, carrier]));

  const activeCarriers = carriers.filter((carrier) => !carrier.inactive);

  const laneOptions = lanes.map((lane) => {
    const rfp = rfpById.get(lane.rfp_id);

    return {
      value: `${lane.rfp_id}|${lane.id}`,
      label: `${rfp?.name ?? "Unknown RFP"} — ${lane.lane_state_pair ?? "Unknown lane"} — ${
        lane.origin_city ?? "—"
      }, ${lane.origin_state ?? "—"} ${lane.origin_zip ?? ""} to ${
        lane.destination_city ?? "—"
      }, ${lane.destination_state ?? "—"} ${lane.destination_zip ?? ""} — ${
        lane.weight_break ?? "No weight break"
      } — Class ${lane.freight_class ?? "—"}`,
    };
  });

  const carrierOptions = activeCarriers.map((carrier) => {
    const org = orgById.get(carrier.organization_id);

    return {
      value: carrier.id,
      label: `${org?.name ?? "Unnamed carrier"} ${carrier.scac ? `(${carrier.scac})` : ""}${
        carrier.is_excluded ? " — Excluded flag" : ""
      }`,
    };
  });

  const templateRowsByRfp = rfps.map((rfp) => {
    const rfpLanes = lanes.filter((lane) => lane.rfp_id === rfp.id);

    return {
      rfp,
      rows: rfpLanes.map((lane) => ({
        rfp_id: rfp.id,
        rfp_name: rfp.name,
        lane_id: lane.id,
        lane_state_pair: lane.lane_state_pair ?? "",
        origin_city: lane.origin_city ?? "",
        origin_state: lane.origin_state ?? "",
        origin_zip: lane.origin_zip ?? "",
        destination_city: lane.destination_city ?? "",
        destination_state: lane.destination_state ?? "",
        destination_zip: lane.destination_zip ?? "",
        weight_break: lane.weight_break ?? "",
        freight_class: lane.freight_class ?? "",
        shipment_count: lane.shipment_count,
        linehaul: "",
        fuel: "",
        accessorials: "",
        additional_cost: "",
        service_days: "",
        no_bid: "",
        no_bid_reason: "",
        notes: "",
      })),
    };
  });

  return (
    <div>
      <SectionHeader
        title="Manual Bid Entry"
        description="Download carrier CSV templates, upload completed bids, or manually enter backup bid lines."
        action={
          <Link
            href="/comparisons"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            View comparisons
          </Link>
        }
      />

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">1. Download carrier CSV template</h2>
        <p className="mt-2 text-sm text-slate-600">
          Download the template for the correct RFP, send it to the carrier, and ask them to fill in linehaul, fuel, accessorials, additional cost, service days, no-bid reason, and notes.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {templateRowsByRfp.map(({ rfp, rows }) => (
            <div
              key={rfp.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
            >
              <div>
                <p className="font-semibold text-slate-950">{rfp.name}</p>
                <p className="text-sm text-slate-500">{rows.length} lanes</p>
              </div>

              <CsvDownloadButton
                filename={`${rfp.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-carrier-bid-template.csv`}
                rows={rows}
              />
            </div>
          ))}

          {!templateRowsByRfp.length && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Create an RFP and shipment lanes before downloading a template.
            </div>
          )}
        </div>
      </div>

      <form
        action={importCarrierBidCsv}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-slate-950">2. Upload completed carrier CSV</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            RFP
            <select
              name="rfp_id"
              required
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select RFP</option>
              {rfps.map((rfp) => (
                <option key={rfp.id} value={rfp.id}>
                  {rfp.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
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

          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Completed CSV file
            <input
              name="bid_file"
              type="file"
              accept=".csv,text/csv"
              required
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Import CSV bids
        </button>
      </form>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">3. Manual backup entry</h2>
        <p className="mt-2 text-sm text-slate-600">
          Use this only for one-off corrections, late carrier updates, or testing.
        </p>
      </div>

      <ManualBidEntryForm
        laneOptions={laneOptions}
        carrierOptions={carrierOptions}
        action={createManualBidLine}
      />

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Showing <span className="font-semibold text-slate-950">{bidLines.length}</span>{" "}
        bid lines from Supabase.
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">RFP</th>
              <th className="px-4 py-3">Lane</th>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Linehaul</th>
              <th className="px-4 py-3">Fuel</th>
              <th className="px-4 py-3">Accessorials</th>
              <th className="px-4 py-3">Additional</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {bidLines.map((bid) => {
              const rfp = rfpById.get(bid.rfp_id);
              const lane = laneById.get(bid.shipment_lane_id);
              const carrier = carrierById.get(bid.carrier_id);
              const carrierOrg = carrier ? orgById.get(carrier.organization_id) : null;

              return (
                <tr key={bid.id}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {rfp?.name ?? "Unknown RFP"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {lane?.lane_state_pair ?? "Unknown lane"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {carrierOrg?.name ?? "Unknown carrier"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{money(bid.linehaul)}</td>
                  <td className="px-4 py-3 text-slate-600">{money(bid.fuel)}</td>
                  <td className="px-4 py-3 text-slate-600">{money(bid.accessorials)}</td>
                  <td className="px-4 py-3 text-slate-600">{money(bid.additional_cost)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {money(bid.total_cost)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {bid.service_days ? `${bid.service_days} days` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {bid.source_type ?? "manual"}
                    {bid.source_filename ? (
                      <div className="text-xs text-slate-400">{bid.source_filename}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{bid.notes ?? "—"}</td>
                </tr>
              );
            })}

            {!bidLines.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={11}>
                  No bid lines entered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
