import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

type PageProps = {
  params: Promise<{
    rfpId: string;
  }>;
};

function money(value: unknown) {
  const num = Number(value || 0);
  return num.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function toNumber(value: FormDataEntryValue | null) {
  const cleaned = String(value || "").replace(/[$,]/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRfpName(rfp: AnyRow) {
  return rfp.name || rfp.title || rfp.rfp_name || "Untitled RFP";
}

function getLaneLabel(lane: AnyRow) {
  const origin = [
    lane.origin_city,
    lane.origin_state,
    lane.origin_zip,
  ]
    .filter(Boolean)
    .join(", ");

  const destination = [
    lane.destination_city,
    lane.destination_state,
    lane.destination_zip,
  ]
    .filter(Boolean)
    .join(", ");

  const weight = lane.weight || lane.weight_lbs || lane.shipment_weight || "";
  const freightClass = lane.class || lane.freight_class || lane.actual_class || "";

  return `${origin || "Origin"} to ${destination || "Destination"}${
    weight ? ` â€¢ ${weight} lbs` : ""
  }${freightClass ? ` â€¢ Class ${freightClass}` : ""}`;
}

async function getCarrierContext() {
  const clerkUser = await currentUser();

  if (!clerkUser?.id) {
    return {
      clerkUser: null,
      platformUser: null,
      carrierOrgIds: [] as string[],
      error: "Please sign in to view carrier RFPs.",
    };
  }

  const supabase = createServiceSupabaseClient();

  const { data: platformUser, error: userError } = await supabase
    .from("platform_users")
    .select("*")
    .eq("clerk_user_id", clerkUser.id)
    .maybeSingle();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!platformUser || platformUser.status !== "active") {
    return {
      clerkUser,
      platformUser,
      carrierOrgIds: [] as string[],
      error:
        "Your account is not active in LaneForge yet. Contact the Super Admin to complete setup.",
    };
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("platform_user_organizations")
    .select("*, organizations(*)")
    .eq("platform_user_id", platformUser.id)
    .eq("status", "active");

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const carrierOrgIds = (memberships || [])
    .filter((membership: AnyRow) => {
      const org = membership.organizations;
      return org?.organization_type === "carrier" && org?.status === "active";
    })
    .map((membership: AnyRow) => membership.organization_id);

  if (!carrierOrgIds.length) {
    return {
      clerkUser,
      platformUser,
      carrierOrgIds,
      error:
        "Your account is active, but it has not been linked to a carrier organization yet. Contact the Super Admin to complete setup.",
    };
  }

  return {
    clerkUser,
    platformUser,
    carrierOrgIds,
    error: null,
  };
}

export default async function CarrierRfpDetailPage({ params }: PageProps) {
  const { rfpId } = await params;
  const context = await getCarrierContext();
  const supabase = createServiceSupabaseClient();

  async function saveBidLine(formData: FormData) {
    "use server";

    const context = await getCarrierContext();

    if (context.error || !context.carrierOrgIds.length) {
      throw new Error(context.error || "Carrier organization access is required.");
    }

    const supabase = createServiceSupabaseClient();

    const rfpLaneId = String(formData.get("rfp_lane_id") || "");
    const carrierOrganizationId = String(
      formData.get("carrier_organization_id") || context.carrierOrgIds[0]
    );

    if (!rfpLaneId || !carrierOrganizationId) {
      throw new Error("Lane and carrier organization are required.");
    }

    if (!context.carrierOrgIds.includes(carrierOrganizationId)) {
      throw new Error("You are not allowed to submit bids for this carrier.");
    }

    const { data: invite, error: inviteError } = await supabase
      .from("rfp_carrier_invites")
      .select("id")
      .eq("rfp_id", rfpId)
      .eq("carrier_organization_id", carrierOrganizationId)
      .maybeSingle();

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    if (!invite) {
      throw new Error("This carrier organization has not been invited to this RFP.");
    }

    const linehaul = toNumber(formData.get("linehaul"));
    const fuel = toNumber(formData.get("fuel"));
    const accessorials = toNumber(formData.get("accessorials"));
    const additionalCosts = toNumber(formData.get("additional_costs"));
    const serviceDays = toNumber(formData.get("service_days"));
    const totalCost = linehaul + fuel + accessorials + additionalCosts;
    const notes = String(formData.get("notes") || "");

    const { error } = await supabase.from("manual_bid_lines").upsert(
      {
        rfp_id: rfpId,
        rfp_lane_id: rfpLaneId,
        carrier_organization_id: carrierOrganizationId,
        linehaul,
        fuel,
        accessorials,
        additional_costs: additionalCosts,
        total_cost: totalCost,
        service_days: serviceDays || null,
        notes,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "rfp_id,rfp_lane_id,carrier_organization_id",
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/carrier/rfps/${rfpId}`);
    revalidatePath(`/rfps/${rfpId}`);
    revalidatePath("/comparisons");
  }

  if (context.error) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold text-slate-950">Carrier RFP</h1>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {context.error}
        </div>
      </main>
    );
  }

  const { data: invite, error: inviteError } = await supabase
    .from("rfp_carrier_invites")
    .select("*")
    .eq("rfp_id", rfpId)
    .in("carrier_organization_id", context.carrierOrgIds)
    .maybeSingle();

  if (inviteError) {
    throw new Error(inviteError.message);
  }

  if (!invite) {
    notFound();
  }

  const carrierOrganizationId = invite.carrier_organization_id;

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .select("*")
    .eq("id", rfpId)
    .maybeSingle();

  if (rfpError) {
    throw new Error(rfpError.message);
  }

  if (!rfp) {
    notFound();
  }

  const { data: lanes, error: lanesError } = await supabase
    .from("rfp_lanes")
    .select("*")
    .eq("rfp_id", rfpId)
    .order("created_at", { ascending: true });

  if (lanesError) {
    throw new Error(lanesError.message);
  }

  const { data: bidLines, error: bidLinesError } = await supabase
    .from("manual_bid_lines")
    .select("*")
    .eq("rfp_id", rfpId)
    .eq("carrier_organization_id", carrierOrganizationId);

  if (bidLinesError) {
    throw new Error(bidLinesError.message);
  }

  const bidByLaneId = new Map(
    (bidLines || []).map((bid: AnyRow) => [bid.rfp_lane_id, bid])
  );

  const laneRows = lanes || [];

  return (
    <main className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Carrier RFP
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            {getRfpName(rfp)}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Review lanes and submit your bid costs. Your submission is only
            visible to the managing organization.
          </p>
        </div>

        <Link
          href="/carrier/rfps"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to carrier RFPs
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Lanes</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {laneRows.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Submitted</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {(bidLines || []).length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Invite status</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {invite.status || "invited"}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Carrier instructions</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
          {rfp.carrier_instructions ||
            rfp.instructions ||
            "No carrier instructions have been provided yet."}
        </p>
      </section>

      <section className="mt-6 space-y-4">
        {laneRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            No lanes have been added to this RFP yet.
          </div>
        ) : (
          laneRows.map((lane: AnyRow) => {
            const existingBid = bidByLaneId.get(lane.id);

            return (
              <form
                key={lane.id}
                action={saveBidLine}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <input type="hidden" name="rfp_lane_id" value={lane.id} />
                <input
                  type="hidden"
                  name="carrier_organization_id"
                  value={carrierOrganizationId}
                />

                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950">
                      {getLaneLabel(lane)}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Shipments: {lane.shipment_count || lane.shipments || 1}
                      {lane.historical_spend
                        ? ` â€¢ Historical spend: ${money(lane.historical_spend)}`
                        : ""}
                    </p>
                  </div>

                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {existingBid ? `Saved total: ${money(existingBid.total_cost)}` : "Not submitted"}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  <label className="text-sm font-medium text-slate-700">
                    Linehaul
                    <input
                      name="linehaul"
                      type="number"
                      step="0.01"
                      defaultValue={existingBid?.linehaul || ""}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Fuel
                    <input
                      name="fuel"
                      type="number"
                      step="0.01"
                      defaultValue={existingBid?.fuel || ""}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Accessorials
                    <input
                      name="accessorials"
                      type="number"
                      step="0.01"
                      defaultValue={existingBid?.accessorials || ""}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Additional costs
                    <input
                      name="additional_costs"
                      type="number"
                      step="0.01"
                      defaultValue={existingBid?.additional_costs || ""}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Service days
                    <input
                      name="service_days"
                      type="number"
                      step="1"
                      defaultValue={existingBid?.service_days || ""}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <label className="mt-3 block text-sm font-medium text-slate-700">
                  Notes
                  <textarea
                    name="notes"
                    defaultValue={existingBid?.notes || ""}
                    className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Transit notes, exclusions, rate assumptions, minimum charge notes, etc."
                  />
                </label>

                <div className="mt-4">
                  <button className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white">
                    Save bid line
                  </button>
                </div>
              </form>
            );
          })
        )}
      </section>
    </main>
  );
}