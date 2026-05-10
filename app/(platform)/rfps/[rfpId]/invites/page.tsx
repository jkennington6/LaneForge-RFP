import Link from "next/link";
import { RfpCarrierInvitesPanel } from "@/components/rfp-carrier-invites-panel";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    rfpId: string;
  }>;
};

export default async function RfpInvitesPage({ params }: PageProps) {
  const { rfpId } = await params;

  const supabase = createServiceSupabaseClient();

  const { data: rfp, error } = await supabase
    .from("rfps")
    .select("*")
    .eq("id", rfpId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const title =
    rfp?.name ||
    rfp?.title ||
    rfp?.rfp_name ||
    "RFP carrier invitations";

  return (
    <main className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">
            Invite carriers
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {title}
          </p>
        </div>

        <Link
          href={`/rfps/${rfpId}`}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to RFP
        </Link>
      </div>

      <RfpCarrierInvitesPanel rfpId={rfpId} />
    </main>
  );
}