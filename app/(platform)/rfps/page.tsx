import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type RfpRow = {
  id: string;
  name: string;
  mode: "LTL" | "FTL" | "BOTH";
  status: "draft" | "active" | "closed" | "archived";
  bid_due_date: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  customer_name: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString();
}

export default async function RfpsPage() {
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("rfps")
    .select(`
      id,
      name,
      mode,
      status,
      bid_due_date,
      effective_date,
      expiration_date,
      customers (
        name
      )
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rfps: RfpRow[] =
    data?.map((rfp: any) => ({
      id: rfp.id,
      name: rfp.name,
      mode: rfp.mode,
      status: rfp.status,
      bid_due_date: rfp.bid_due_date,
      effective_date: rfp.effective_date,
      expiration_date: rfp.expiration_date,
      customer_name: Array.isArray(rfp.customers)
        ? rfp.customers[0]?.name ?? null
        : rfp.customers?.name ?? null,
    })) ?? [];

  return (
    <div>
      <SectionHeader
        title="RFPs"
        description="Manage customer bid events, shipment data, and carrier participation."
        action={
          <Link
            href="/rfps/new"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Create RFP
          </Link>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">RFP Name</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Bid Due</th>
              <th className="px-4 py-3">Effective</th>
              <th className="px-4 py-3">Expiration</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {rfps.map((rfp) => (
              <tr key={rfp.id}>
                <td className="px-4 py-3 text-slate-600">
                  {rfp.customer_name ?? "-"}
                </td>

                <td className="px-4 py-3 font-semibold text-slate-950">
                  {rfp.name}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {rfp.mode}
                </td>

                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {rfp.status}
                  </span>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {formatDate(rfp.bid_due_date)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {formatDate(rfp.effective_date)}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {formatDate(rfp.expiration_date)}
                </td>

                <td className="px-4 py-3">
                  <Link
                    href={`/rfps/${rfp.id}`}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}

            {!rfps.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={8}>
                  No active RFPs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}