import Link from "next/link";
import { requireCustomerPortalUser, getCustomerOrgIdsForCurrentUser } from "@/lib/portal-access";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

function pick(row: AnyRow | null | undefined, keys: string[]) {
  if (!row) return null;

  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
}

function text(row: AnyRow | null | undefined, keys: string[], fallback = "â€”") {
  const value = pick(row, keys);
  return value === null ? fallback : String(value);
}

function formatDate(value: unknown) {
  if (!value) return "Not set";

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function rowBelongsToAnyOrg(row: AnyRow, orgIds: string[]) {
  if (!orgIds.length) return false;

  return Object.values(row).some((value) => orgIds.includes(String(value)));
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("active") || normalized.includes("open")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalized.includes("draft")) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  if (normalized.includes("closed") || normalized.includes("complete")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default async function CustomerRfpsPage() {
  const user = await requireCustomerPortalUser();
  const customerOrgIds = (await getCustomerOrgIdsForCurrentUser(user)) ?? [];

  if (!customerOrgIds.length) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold text-slate-950">Customer RFPs</h1>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Your account is active, but it has not been linked to a customer organization yet.
          Contact the Super Admin to complete setup.
        </div>
      </main>
    );
  }

  const supabase = createServiceSupabaseClient();

  const { data: rfpRows, error: rfpError } = await supabase
    .from("rfps")
    .select("*");

  if (rfpError) {
    throw new Error(rfpError.message);
  }

  const rfps = ((rfpRows ?? []) as AnyRow[])
    .filter((rfp) => rowBelongsToAnyOrg(rfp, customerOrgIds))
    .sort((a, b) => {
      const aDate = new Date(String(pick(a, ["created_at", "updated_at"]) ?? 0)).getTime();
      const bDate = new Date(String(pick(b, ["created_at", "updated_at"]) ?? 0)).getTime();

      return bDate - aDate;
    });

  const activeCount = rfps.filter((rfp) => {
    const status = text(rfp, ["status", "rfp_status"], "").toLowerCase();
    return status.includes("active") || status.includes("open");
  }).length;

  const draftCount = rfps.filter((rfp) => {
    const status = text(rfp, ["status", "rfp_status"], "").toLowerCase();
    return status.includes("draft");
  }).length;

  return (
    <main className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Customer RFPs</h1>
          <p className="mt-1 text-sm text-slate-600">
            View RFPs released to your organization. Carrier bid amounts, savings,
            comparisons, routing guides, and award recommendations remain hidden unless released.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total RFPs</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{rfps.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Active RFPs</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{activeCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Draft / Setup</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{draftCount}</p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Released RFPs</h2>
          <p className="mt-1 text-sm text-slate-600">
            These are the RFPs currently connected to your organization.
          </p>
        </div>

        {rfps.length ? (
          <div className="divide-y divide-slate-200">
            {rfps.map((rfp) => {
              const id = String(rfp.id);
              const title = text(rfp, ["name", "title", "rfp_name"], "Untitled RFP");
              const status = text(rfp, ["status", "rfp_status"], "Unknown");
              const type = text(rfp, ["type", "rfp_type", "transportation_mode", "mode"], "RFP");
              const dueDate = pick(rfp, ["due_date", "bid_due_date", "deadline", "bid_deadline"]);

              return (
                <Link
                  key={id}
                  href={`/customer/rfps/${id}`}
                  className="block px-5 py-4 transition hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">{title}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {type} Â· Due date: {formatDate(dueDate)}
                      </p>
                    </div>

                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(status)}`}>
                      {status}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="p-5 text-sm text-slate-600">
            No RFPs have been released to your organization yet.
          </div>
        )}
      </div>
    </main>
  );
}