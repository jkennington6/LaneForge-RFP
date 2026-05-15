import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
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

type ReleaseEvent = {
  id: string;
  rfp_id: string;
  action: string;
  preset: string | null;
  settings_snapshot: Record<string, unknown> | null;
  notes: string | null;
  created_by_clerk_user_id: string | null;
  created_at: string;
};

const defaultReleaseSettings: ReleaseSettings = {
  rfp_id: "",
  show_carrier_names: false,
  show_bid_amounts: false,
  show_savings: false,
  show_comparisons: false,
  show_routing_guide: false,
  show_award_recommendation: false,
  release_notes: null,
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function eventLabel(event: ReleaseEvent) {
  if (event.action === "preset_apply") {
    return `Preset applied: ${event.preset ?? "unknown"}`;
  }

  if (event.action === "manual_save") {
    return "Manual settings save";
  }

  if (event.action === "restore_snapshot") {
    return "Restored previous release settings";
  }

  return event.action;
}

async function logReleaseEvent({
  rfpId,
  action,
  preset,
  settingsSnapshot,
  notes,
}: {
  rfpId: string;
  action: string;
  preset?: string | null;
  settingsSnapshot: Record<string, unknown>;
  notes?: string | null;
}) {
  const supabase = createServiceSupabaseClient();
  const { userId } = await auth();

  const { error } = await supabase.from("rfp_customer_release_events").insert({
    rfp_id: rfpId,
    action,
    preset: preset ?? null,
    settings_snapshot: settingsSnapshot,
    notes: notes ?? null,
    created_by_clerk_user_id: userId ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

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

  await logReleaseEvent({
    rfpId,
    action: "manual_save",
    settingsSnapshot: payload,
    notes: payload.release_notes,
  });

  revalidatePath(`/rfps/${rfpId}/customer-release`);
  revalidatePath(`/rfps/${rfpId}`);
  revalidatePath(`/customer/rfps/${rfpId}`);
}

async function applyReleasePreset(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") ?? "").trim();
  const preset = String(formData.get("preset") ?? "").trim();

  if (!rfpId || !preset) {
    throw new Error("RFP ID and preset are required.");
  }

  const basePayload = {
    rfp_id: rfpId,
    show_carrier_names: false,
    show_bid_amounts: false,
    show_savings: false,
    show_comparisons: false,
    show_routing_guide: false,
    show_award_recommendation: false,
    release_notes: null as string | null,
    updated_at: new Date().toISOString(),
  };

  const payload =
    preset === "lock_customer_view"
      ? {
          ...basePayload,
          release_notes:
            "Customer visibility is currently locked while the RFP is under internal review.",
        }
      : preset === "release_awards_only"
        ? {
            ...basePayload,
            show_carrier_names: true,
            show_routing_guide: true,
            show_award_recommendation: true,
            release_notes:
              "Formal award recommendations have been released. Bid amounts, savings, and comparison details remain hidden.",
          }
        : preset === "full_customer_release"
          ? {
              ...basePayload,
              show_carrier_names: true,
              show_bid_amounts: true,
              show_savings: true,
              show_comparisons: true,
              show_routing_guide: true,
              show_award_recommendation: true,
              release_notes:
                "Full customer release is enabled, including carrier names, bid amounts, savings, comparisons, routing guide, and award recommendations.",
            }
          : null;

  if (!payload) {
    throw new Error("Unknown release preset.");
  }

  const { error } = await supabase
    .from("rfp_customer_release_settings")
    .upsert(payload, {
      onConflict: "rfp_id",
    });

  if (error) {
    throw new Error(error.message);
  }

  await logReleaseEvent({
    rfpId,
    action: "preset_apply",
    preset,
    settingsSnapshot: payload,
    notes: payload.release_notes,
  });

  revalidatePath(`/rfps/${rfpId}/customer-release`);
  revalidatePath(`/rfps/${rfpId}`);
  revalidatePath(`/customer/rfps/${rfpId}`);
}


async function restoreReleaseSnapshot(formData: FormData) {
  "use server";

  const supabase = createServiceSupabaseClient();

  const rfpId = String(formData.get("rfp_id") ?? "").trim();
  const eventId = String(formData.get("event_id") ?? "").trim();

  if (!rfpId || !eventId) {
    throw new Error("RFP ID and release event ID are required.");
  }

  const { data: event, error: eventError } = await supabase
    .from("rfp_customer_release_events")
    .select("*")
    .eq("id", eventId)
    .eq("rfp_id", rfpId)
    .single();

  if (eventError || !event) {
    throw new Error(eventError?.message ?? "Release event not found.");
  }

  const snapshot = (event.settings_snapshot ?? {}) as Record<string, any>;

  const payload = {
    rfp_id: rfpId,
    show_carrier_names: Boolean(snapshot.show_carrier_names),
    show_bid_amounts: Boolean(snapshot.show_bid_amounts),
    show_savings: Boolean(snapshot.show_savings),
    show_comparisons: Boolean(snapshot.show_comparisons),
    show_routing_guide: Boolean(snapshot.show_routing_guide),
    show_award_recommendation: Boolean(snapshot.show_award_recommendation),
    release_notes:
      typeof snapshot.release_notes === "string" && snapshot.release_notes.trim()
        ? snapshot.release_notes.trim()
        : null,
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

  await logReleaseEvent({
    rfpId,
    action: "restore_snapshot",
    preset: event.preset ?? null,
    settingsSnapshot: payload,
    notes: `Restored settings from release history event ${eventId}.`,
  });

  revalidatePath(`/rfps/${rfpId}/customer-release`);
  revalidatePath(`/rfps/${rfpId}`);
  revalidatePath(`/customer/rfps/${rfpId}`);
}
export default async function CustomerReleasePage({
  params,
}: {
  params: Promise<{ rfpId: string }>;
}) {
  const { rfpId } = await params;
  const supabase = createServiceSupabaseClient();

  const [rfpResult, settingsResult, eventsResult] = await Promise.all([
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

    supabase
      .from("rfp_customer_release_events")
      .select(
        "id, rfp_id, action, preset, settings_snapshot, notes, created_by_clerk_user_id, created_at"
      )
      .eq("rfp_id", rfpId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (rfpResult.error || !rfpResult.data) {
    notFound();
  }

  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  const rfp = rfpResult.data;

  const settings: ReleaseSettings =
    settingsResult.data ?? {
      ...defaultReleaseSettings,
      rfp_id: rfpId,
    };

  const releaseEvents = (eventsResult.data ?? []) as ReleaseEvent[];

  return (
    <div>
      <SectionHeader
        title="Customer Release Controls"
        description={`${rfp.name} - control what the customer can see`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/rfps/${rfp.id}/readiness`}
              className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
            >
              Readiness
            </Link>

            <Link
              href={`/rfps/${rfp.id}`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to RFP
            </Link>

            <Link
              href={`/rfps/${rfp.id}/awards`}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Awards
            </Link>

            <Link
              href={`/rfps/${rfp.id}/customer-release/export`}
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
            >
              Release History CSV
            </Link>

            <Link
              href={`/rfps/${rfp.id}/awards/summary`}
              className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
            >
              Award Summary
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
        Keep customer release settings locked until internal review is complete. Customers should not see carrier names, pricing, savings, routing guides, or award recommendations until the managing organization explicitly releases them.
      </div>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Release Presets</h2>
        <p className="mt-1 text-sm text-slate-600">
          Use presets for common release stages. You can still manually adjust individual switches below.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <form
            action={applyReleasePreset}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <input type="hidden" name="rfp_id" value={rfp.id} />
            <input type="hidden" name="preset" value="lock_customer_view" />

            <h3 className="font-semibold text-slate-950">Lock Customer View</h3>
            <p className="mt-1 text-sm text-slate-600">
              Turns everything off. Best while bids are still being reviewed internally.
            </p>

            <button
              type="submit"
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Apply Lockdown
            </button>
          </form>

          <form
            action={applyReleasePreset}
            className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"
          >
            <input type="hidden" name="rfp_id" value={rfp.id} />
            <input type="hidden" name="preset" value="release_awards_only" />

            <h3 className="font-semibold text-indigo-950">Release Awards Only</h3>
            <p className="mt-1 text-sm text-indigo-800">
              Releases carrier names, routing guide, and award recommendations without bid dollars or savings.
            </p>

            <button
              type="submit"
              className="mt-4 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Release Awards Only
            </button>
          </form>

          <form
            action={applyReleasePreset}
            className="rounded-2xl border border-green-200 bg-green-50 p-4"
          >
            <input type="hidden" name="rfp_id" value={rfp.id} />
            <input type="hidden" name="preset" value="full_customer_release" />

            <h3 className="font-semibold text-green-950">Full Customer Release</h3>
            <p className="mt-1 text-sm text-green-800">
              Releases carrier names, bid amounts, savings, comparisons, routing guide, and awards.
            </p>

            <button
              type="submit"
              className="mt-4 rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
            >
              Release Everything
            </button>
          </form>
        </div>
      </section>

      <form
        action={saveReleaseSettings}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="rfp_id" value={rfp.id} />

        <h2 className="text-lg font-semibold text-slate-950">
          Manual Release Settings
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
                Allows the customer to see pricing values from carrier bids and award costs.
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
                Allows the customer to see comparison-level outputs and downloads.
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
                Allows the customer to see formal award recommendations.
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
          Save Manual Settings
        </button>
      </form>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Release History
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Recent customer visibility changes for this RFP.
          </p>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Carrier Names</th>
              <th className="px-4 py-3">Bid Amounts</th>
              <th className="px-4 py-3">Savings</th>
              <th className="px-4 py-3">Comparisons</th>
              <th className="px-4 py-3">Routing</th>
              <th className="px-4 py-3">Awards</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Restore</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {releaseEvents.map((event) => {
              const snapshot = event.settings_snapshot ?? {};

              return (
                <tr key={event.id}>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(event.created_at)}
                  </td>

                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {eventLabel(event)}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {yesNo(Boolean(snapshot.show_carrier_names))}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {yesNo(Boolean(snapshot.show_bid_amounts))}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {yesNo(Boolean(snapshot.show_savings))}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {yesNo(Boolean(snapshot.show_comparisons))}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {yesNo(Boolean(snapshot.show_routing_guide))}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {yesNo(Boolean(snapshot.show_award_recommendation))}
                  </td>

                  <td className="max-w-md px-4 py-3 text-slate-600">
                    {event.notes ?? "-"}
                  </td>

                  <td className="px-4 py-3">
                    <form action={restoreReleaseSnapshot}>
                      <input type="hidden" name="rfp_id" value={rfp.id} />
                      <input type="hidden" name="event_id" value={event.id} />

                      <button
                        type="submit"
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        Restore
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}

            {!releaseEvents.length && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={10}>
                  No release history is available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}