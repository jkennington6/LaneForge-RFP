import Link from "next/link";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/supabase";

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
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
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one bid row.");
  }

  const headers = parseCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase()
  );

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });
}

function toNullableNumber(value: string | null | undefined) {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  const cleaned = raw.replace(/[$,%]/g, "");
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableInteger(value: string | null | undefined) {
  const raw = String(value ?? "").trim();

  if (!raw) return null;

  const parsed = Number(raw);

  return Number.isInteger(parsed) ? parsed : null;
}

function requireHeader(rows: Record<string, string>[], header: string) {
  if (!rows.length) return;

  if (!(header in rows[0])) {
    throw new Error(`Missing required CSV column: ${header}`);
  }
}

async function uploadBid(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const inviteId = String(formData.get("invite_id") ?? "").trim();
  const rfpId = String(formData.get("rfp_id") ?? "").trim();
  const carrierName = String(formData.get("carrier_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const file = formData.get("bid_file");

  if (!inviteId || !rfpId || !carrierName || !token) {
    throw new Error("Missing required invite information.");
  }

  if (!(file instanceof File)) {
    throw new Error("Please choose a CSV file to upload.");
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Only CSV uploads are supported right now. Please upload the downloaded CSV template.");
  }

  const csvText = await file.text();
  const rows = parseCsv(csvText);

  requireHeader(rows, "lane_id");
  requireHeader(rows, "origin_zip");
  requireHeader(rows, "destination_zip");
  requireHeader(rows, "discount");
  requireHeader(rows, "minimum_charge");
  requireHeader(rows, "rate_per_lb");

  const validRows = rows.filter((row) => {
    const laneId = String(row.lane_id ?? "").trim();
    const discount = toNullableNumber(row.discount);
    const minimumCharge = toNullableNumber(row.minimum_charge);
    const ratePerLb = toNullableNumber(row.rate_per_lb);

    return Boolean(laneId) && (
      discount !== null ||
      minimumCharge !== null ||
      ratePerLb !== null
    );
  });

  if (!validRows.length) {
    throw new Error("No valid bid rows found. Each row needs a lane_id and at least one pricing field.");
  }

  const { data: submission, error: submissionError } = await supabase
    .from("carrier_bid_submissions")
    .insert({
      rfp_id: rfpId,
      invite_id: inviteId,
      carrier_name: carrierName,
      submitted_by_email: contactEmail || null,
      original_filename: file.name,
      status: "processed",
      uploaded_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    throw new Error(submissionError?.message ?? "Unable to create bid submission.");
  }

  const laneRateRows = validRows.map((row) => {
    const originState = String(row.origin_state ?? "").trim().toUpperCase() || null;
    const destinationState = String(row.destination_state ?? "").trim().toUpperCase() || null;

    return {
      submission_id: submission.id,
      rfp_id: rfpId,
      lane_id: String(row.lane_id ?? "").trim() || null,

      origin_zip: String(row.origin_zip ?? "").trim() || null,
      destination_zip: String(row.destination_zip ?? "").trim() || null,

      origin_state: originState,
      destination_state: destinationState,
      lane_state_pair:
        String(row.lane_state_pair ?? "").trim() ||
        (originState && destinationState ? `${originState}-${destinationState}` : null),

      weight_break: String(row.weight_break ?? "").trim() || null,
      freight_class: String(row.freight_class ?? "").trim() || null,

      discount: toNullableNumber(row.discount),
      minimum_charge: toNullableNumber(row.minimum_charge),
      rate_per_lb: toNullableNumber(row.rate_per_lb),

      fuel_program: String(row.fuel_program ?? "").trim() || null,
      accessorial_charge: toNullableNumber(row.accessorial_charge),
      transit_days: toNullableInteger(row.transit_days),
      notes: String(row.carrier_notes ?? row.notes ?? "").trim() || null,
    };
  });

  const { error: laneRateError } = await supabase
    .from("carrier_bid_lane_rates")
    .insert(laneRateRows);

  if (laneRateError) {
    throw new Error(laneRateError.message);
  }

  await supabase
    .from("rfp_carrier_invites")
    .update({
      status: "submitted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId);

  redirect(`/carrier/invite/${token}/upload?submitted=1&rows=${laneRateRows.length}`);
}

export default async function CarrierBidUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ submitted?: string; rows?: string }>;
}) {
  const { token } = await params;
  const { submitted, rows } = await searchParams;

  const supabase = createServiceSupabaseClient();

  const { data: invite, error } = await supabase
    .from("rfp_carrier_invites")
    .select(`
      id,
      rfp_id,
      carrier_name,
      contact_email,
      status,
      invite_token,
      rfps (
        id,
        name,
        mode,
        bid_due_date
      )
    `)
    .eq("invite_token", token)
    .single();

  if (error || !invite) {
    notFound();
  }

  const rfp = Array.isArray(invite.rfps) ? invite.rfps[0] : invite.rfps;

  if (!rfp) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/carrier/invite/${token}`}
          className="text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          Back to invite
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-slate-950">
          Submit Bid - {rfp.name}
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Carrier: {invite.carrier_name}
        </p>
      </div>

      {submitted === "1" && (
        <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Bid uploaded successfully. Imported {rows ?? "0"} lane pricing row(s).
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        Upload the completed CSV bid template. Lane rows must include a lane_id
        and at least one pricing field: discount, minimum_charge, or rate_per_lb.
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href={`/carrier/invite/${token}/template`}
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
        >
          Download Bid Template
        </Link>
      </div>

      <form
        action={uploadBid}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="invite_id" value={invite.id} />
        <input type="hidden" name="rfp_id" value={rfp.id} />
        <input type="hidden" name="carrier_name" value={invite.carrier_name} />
        <input type="hidden" name="contact_email" value={invite.contact_email} />
        <input type="hidden" name="token" value={token} />

        <label className="block text-sm font-medium text-slate-700">
          Completed bid CSV
          <input
            name="bid_file"
            type="file"
            accept=".csv,text/csv"
            required
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Upload Bid
        </button>
      </form>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        XLSX upload support will be added after the CSV parser is stable.
      </div>
    </div>
  );
}