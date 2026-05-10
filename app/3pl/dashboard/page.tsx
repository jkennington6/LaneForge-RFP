import { createServiceSupabaseClient } from "@/lib/supabase";
import {
  get3plOrgIdsForCurrentUser,
  require3plPortalUser,
} from "@/lib/portal-access";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

export default async function ThreePlDashboardPage() {
  const user = await require3plPortalUser();
  const supabase = createServiceSupabaseClient();

  const threePlOrgIds = await get3plOrgIdsForCurrentUser(user);

  const { data: organizations, error } = threePlOrgIds.length
    ? await supabase
        .from("organizations")
        .select("*")
        .in("id", threePlOrgIds)
        .order("name", { ascending: true })
    : { data: [], error: null };

  if (error) {
    throw new Error(error.message);
  }

  const orgRows = (organizations || []) as AnyRow[];
  const primaryOrg = orgRows[0];

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            3PL Workspace
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border bg-slate-50 text-lg font-bold text-slate-500"
              style={{ borderColor: primaryOrg?.brand_color || "#e2e8f0" }}
            >
              {primaryOrg?.logo_url ? (
                <img
                  src={primaryOrg.logo_url}
                  alt={primaryOrg.name}
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                String(primaryOrg?.name || "3PL").slice(0, 2).toUpperCase()
              )}
            </div>

            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                {primaryOrg?.name || "3PL Portal"}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Signed in as {user.email || user.clerk_user_id}
              </p>
            </div>
          </div>

          {!orgRows.length && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Your account is active as a 3PL user, but it is not linked to an
              active 3PL organization yet. The platform owner needs to link this
              user to a 3PL organization from Access Control.
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Role</p>
            <p className="mt-2 text-xl font-bold text-slate-950">
              {user.platform_role}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">3PL orgs</p>
            <p className="mt-2 text-xl font-bold text-slate-950">
              {orgRows.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Customer access</p>
            <p className="mt-2 text-xl font-bold text-slate-950">Controlled</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Carrier invites</p>
            <p className="mt-2 text-xl font-bold text-slate-950">Coming next</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Next workspace features</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This 3PL workspace will be where Little River can create customer
            RFPs, invite carriers, manage bid visibility, and control what each
            customer can see. It is intentionally separate from the true
            platform owner/master-admin view.
          </p>
        </section>
      </div>
    </main>
  );
}