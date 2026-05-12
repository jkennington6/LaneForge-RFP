import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";

type ReleaseSettings = {
  rfp_id: string;
  show_carrier_names: boolean;
  show_bid_amounts: boolean;
  show_savings: boolean;
  show_comparisons: boolean;
  show_routing_guide: boolean;
  show_award_recommendation: boolean;
  release_notes: string | null;
};

async function saveReleaseSettings(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") ?? "").trim();

  if (!rfpId) {
    throw new Error("RFP ID is required.");
  }

  const payload = {
    rfp_id: rfpId,
    show_carrier_names: formData.get("show_carrier_names") === "on",
    show_bid_amounts: formData.get("show_bid_amounts") === "on",
    show_savings: formData.get("show_savings") === "on",
    show_comparisons: formData.get("show_comparisons") === "on",
    show_routing_guide: formData.get("show_routing_guide") === "on",
    show_award_recommendation: formData.get("show_award_recommendation") === "on",
    release_notes: String(formData.get("release_notes") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("rfp_customer_release_settings")
    .upsert(payload, {
      onConflict: "rfp_id",
    });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/rfps/${rfpId}/customer-release`);
  revalidatePath(`/rfps/${rfpId}`);
}

export default async function CustomerReleasePage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, settingsResult] = await Promise.all([
    supabase
      .from("rfps")
      .select("id, name, mode, status, bid_due_date")
      .eq("id", rfpId)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("rfp_customer_release_settings")
      .select(
        "rfp_id, show_carrier_names, show_bid_amounts, show_savings, show_comparisons, show_routing_guide, show_award_recommendation, release_notes"
      )
      .eq("rfp_id", rfpId)
      .maybeSingle(),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  const rfp = rfpResult.data;

  const settings: ReleaseSettings =
    settingsResult.data ?? {
      rfp_id: rfpId,
      show_carrier_names: false,
      show_bid_amounts: false,
      show_savings: false,
      show_comparisons: false,
      show_routing_guide: false,
      show_award_recommendation: false,
      release_notes: null,
    };

  return (
    <div>
      <SectionHeader
        title="Customer Release Controls"
        description={`${rfp.name} - control what the customer can see`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to RFP
            </Link>

            <Link
              href={`/rfps/${rfp.id}/comparisons`}
              className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100"
            >
              Comparisons
            </Link>

            <Link
              href={`/rfps/${rfp.id}/routing-guide`}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Routing Guide
            </Link>
          </div>
        }
      />

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Keep these controls off until internal review is complete. Customers should not see carrier names,
        pricing, savings, routing guides, or award recommendations until the 3PL/internal user explicitly releases them.
      </div>

      <form
        action={saveReleaseSettings}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="rfp_id" value={rfp.id} />

        <h2 className="text-lg font-semibold text-slate-950">
          Release Settings
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          These switches control what customer-facing RFP views are allowed to expose.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              name="show_carrier_names"
              type="checkbox"
              defaultChecked={settings.show_carrier_names}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950">
                Show carrier names
              </span>
              <span className="block text-sm text-slate-600">
                Allows the customer to see which carriers participated or were recommended.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              name="show_bid_amounts"
              type="checkbox"
              defaultChecked={settings.show_bid_amounts}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950">
                Show bid amounts
              </span>
              <span className="block text-sm text-slate-600">
                Allows the customer to see pricing values from carrier bids.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              name="show_savings"
              type="checkbox"
              defaultChecked={settings.show_savings}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950">
                Show savings
              </span>
              <span className="block text-sm text-slate-600">
                Allows the customer to see estimated savings versus historical spend.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              name="show_comparisons"
              type="checkbox"
              defaultChecked={settings.show_comparisons}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950">
                Show comparisons
              </span>
              <span className="block text-sm text-slate-600">
                Allows the customer to see comparison-level outputs.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              name="show_routing_guide"
              type="checkbox"
              defaultChecked={settings.show_routing_guide}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950">
                Show routing guide
              </span>
              <span className="block text-sm text-slate-600">
                Allows the customer to see the primary, backup, and tertiary routing guide.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              name="show_award_recommendation"
              type="checkbox"
              defaultChecked={settings.show_award_recommendation}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950">
                Show award recommendation
              </span>
              <span className="block text-sm text-slate-600">
                Allows the customer to see recommended award decisions.
              </span>
            </span>
          </label>
        </div>

        <label className="mt-6 block text-sm font-medium text-slate-700">
          Release notes
          <textarea
            name="release_notes"
            defaultValue={settings.release_notes ?? ""}
            rows={4}
            placeholder="Optional notes about what was released and why."
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          className="mt-6 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Save Release Settings
        </button>
      </form>
    </div>
  );
}