import Link from "next/link";
import {
  CalendarDays,
  FileSpreadsheet,
  ShieldCheck,
  Truck,
} from "lucide-react";

import {
  getCustomerOrgIdsForCurrentUser,
  requireCustomerPortalUser,
} from "@/lib/portal-access";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function countByRfpId(rows: AnyRow[], field = "rfp_id") {
  const map = new Map<string, number>();

  for (const row of rows) {
    const id = String(row[field] ?? "");
    if (!id) continue;
    map.set(id, (map.get(id) ?? 0) + 1);
  }

  return map;
}

export default async function CustomerHomePage() {
  const user = await requireCustomerPortalUser();
  const supabase = createServiceSupabaseClient();

  const customerOrgIds = (await getCustomerOrgIdsForCurrentUser(user)) ?? [];

  if (!customerOrgIds.length) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold text-slate-950">Customer Portal</h1>

        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          Your account is active, but it has not been linked to a customer organization yet.
          Contact your LaneForge administrator to complete setup.
        </div>
      </main>
    );
  }

  const { data: organizations } = await supabase
    .from("organizations")
    .select("*")
    .in("id", customerOrgIds)
    .order("name", { ascending: true });

  const { data: rfps, error: rfpsError } = await supabase
    .from("rfps")
    .select("*")
    .in("customer_organization_id", customerOrgIds)
    .order("created_at", { ascending: false });

  if (rfpsError) {
    throw new Error(rfpsError.message);
  }

  const rfpRows = rfps ?? [];
  const rfpIds = rfpRows.map((rfp) => String(rfp.id));

  let lanes: AnyRow[] = [];
  let invites: AnyRow[] = [];

  if (rfpIds.length) {
    const { data: laneRows } = await supabase
      .from("rfp_lanes")
      .select("*")
      .in("rfp_id", rfpIds);

    const { data: inviteRows } = await supabase
      .from("rfp_carrier_invites")
      .select("*")
      .in("rfp_id", rfpIds);

    lanes = laneRows ?? [];
    invites = inviteRows ?? [];
  }

  const lanesByRfp = countByRfpId(lanes);
  const invitesByRfp = countByRfpId(invites);

  const activeRfps = rfpRows.filter((rfp) =>
    ["active", "open", "published"].includes(String(rfp.status ?? "").toLowerCase())
  );

  return (
    <main className="p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Customer workspace
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          {organizations?.[0]?.name ?? "Customer Portal"}
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Signed in as {user.email}. This portal shows customer-facing RFP activity only.
          Carrier bid amounts, savings, comparisons, routing guides, and award recommendations
          remain hidden unless released by the managing organization.
        </p>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Visible RFPs</p>
            <FileSpreadsheet className="h-5 w-5 text-slate-500" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-950">{rfpRows.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Active RFPs</p>
            <CalendarDays className="h-5 w-5 text-slate-500" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-950">{activeRfps.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Shipment lanes</p>
            <Truck className="h-5 w-5 text-slate-500" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-950">{lanes.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Visibility controlled</p>
            <ShieldCheck className="h-5 w-5 text-slate-500" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-950">Yes</p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Your RFPs</h2>
            <p className="mt-1 text-sm text-slate-600">
              Open an RFP to review released shipment information, instructions, carrier status,
              and customer-facing updates.
            </p>
          </div>
        </div>

        {!rfpRows.length ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
            No RFPs are currently visible to this customer account.
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {rfpRows.map((rfp) => {
              const rfpId = String(rfp.id);
              const status = String(rfp.status ?? "draft");

              return (
                <Link
                  key={rfpId}
                  href={`/customer/rfps/${rfpId}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-950">
                          {rfp.title ?? rfp.name ?? "Untitled RFP"}
                        </h3>

                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                          {status}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-slate-600">
                        Due date: {formatDate(rfp.bid_due_date ?? rfp.due_date)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-right text-sm">
                      <div>
                        <p className="font-bold text-slate-950">{lanesByRfp.get(rfpId) ?? 0}</p>
                        <p className="text-xs text-slate-500">lanes</p>
                      </div>

                      <div>
                        <p className="font-bold text-slate-950">{invitesByRfp.get(rfpId) ?? 0}</p>
                        <p className="text-xs text-slate-500">carrier invites</p>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
