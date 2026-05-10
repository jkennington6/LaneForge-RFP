import { revalidatePath } from "next/cache";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { requireAccessAdmin } from "@/lib/portal-access";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

const roleOptions = Array.from(
  new Set([
    "owner",
    "admin",
    "pricing_admin",
    "pricing_manager",
    "pricing_director",
    "pricing_analyst",
    "internal_user",
    "3pl_admin",
    "3pl_user",
    "customer_admin",
    "customer_user",
    "carrier_admin",
    "carrier_user",
  ])
);

const organizationTypeOptions = Array.from(
  new Set(["internal", "3pl", "customer", "carrier"])
);

const organizationRoleOptions = ["member", "admin", "viewer"];

function cleanOrgType(type: string | null | undefined) {
  if (!type) return "customer";
  if (type === "shipper") return "customer";
  return type;
}

function initials(name: string | null | undefined) {
  if (!name) return "LF";

  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getUserLabel(user: AnyRow) {
  return user.email || user.clerk_user_id || user.id;
}

async function createPlatformUser(formData: FormData) {
  "use server";

  await requireAccessAdmin();

  const supabase = createServiceSupabaseClient();

  const clerkUserId = String(formData.get("clerk_user_id") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const platformRole = String(formData.get("platform_role") || "customer_user").trim();
  const status = String(formData.get("status") || "active").trim();

  if (!clerkUserId) {
    throw new Error("Clerk User ID is required.");
  }

  const { error } = await supabase.from("platform_users").upsert(
    {
      clerk_user_id: clerkUserId,
      email,
      platform_role: platformRole,
      status,
    },
    { onConflict: "clerk_user_id" }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/access");
}

async function savePlatformUser(formData: FormData) {
  "use server";

  await requireAccessAdmin();

  const ownerEmail = String(process.env.PLATFORM_OWNER_EMAIL || "").toLowerCase();
  const supabase = createServiceSupabaseClient();

  const platformUserId = String(formData.get("platform_user_id") || "");
  const email = String(formData.get("email") || "").toLowerCase();
  const platformRole = String(formData.get("platform_role") || "customer_user");
  const status = String(formData.get("status") || "active");

  if (!platformUserId) {
    throw new Error("Platform user ID is required.");
  }

  const updateData =
    ownerEmail && email === ownerEmail
      ? {
          platform_role: "owner",
          status: "active",
        }
      : {
          platform_role: platformRole,
          status,
        };

  const { error } = await supabase
    .from("platform_users")
    .update(updateData)
    .eq("id", platformUserId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/access");
}

async function createOrganization(formData: FormData) {
  "use server";

  await requireAccessAdmin();

  const supabase = createServiceSupabaseClient();

  const name = String(formData.get("name") || "").trim();
  const organizationType = cleanOrgType(
    String(formData.get("organization_type") || "customer").trim()
  );
  const status = String(formData.get("status") || "active").trim();
  const logoUrl = String(formData.get("logo_url") || "").trim();
  const websiteUrl = String(formData.get("website_url") || "").trim();
  const brandColor = String(formData.get("brand_color") || "#f97316").trim();

  if (!name) {
    throw new Error("Organization name is required.");
  }

  const { error } = await supabase.from("organizations").insert({
    name,
    organization_type: organizationType,
    status,
    logo_url: logoUrl || null,
    website_url: websiteUrl || null,
    brand_color: brandColor || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/access");
}

async function saveOrganization(formData: FormData) {
  "use server";

  await requireAccessAdmin();

  const supabase = createServiceSupabaseClient();

  const organizationId = String(formData.get("organization_id") || "");
  const name = String(formData.get("name") || "").trim();
  const organizationType = cleanOrgType(
    String(formData.get("organization_type") || "customer").trim()
  );
  const status = String(formData.get("status") || "active").trim();
  const logoUrl = String(formData.get("logo_url") || "").trim();
  const websiteUrl = String(formData.get("website_url") || "").trim();
  const brandColor = String(formData.get("brand_color") || "").trim();

  if (!organizationId) {
    throw new Error("Organization ID is required.");
  }

  if (!name) {
    throw new Error("Organization name is required.");
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      organization_type: organizationType,
      status,
      logo_url: logoUrl || null,
      website_url: websiteUrl || null,
      brand_color: brandColor || null,
    })
    .eq("id", organizationId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/access");
}

async function linkUserToOrganization(formData: FormData) {
  "use server";

  await requireAccessAdmin();

  const supabase = createServiceSupabaseClient();

  const platformUserId = String(formData.get("platform_user_id") || "");
  const organizationId = String(formData.get("organization_id") || "");
  const organizationRole = String(formData.get("organization_role") || "member");

  if (!platformUserId || !organizationId) {
    throw new Error("User and organization are required.");
  }

  const { error } = await supabase.from("platform_user_organizations").upsert(
    {
      platform_user_id: platformUserId,
      organization_id: organizationId,
      organization_role: organizationRole,
      status: "active",
    },
    { onConflict: "platform_user_id,organization_id" }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/access");
}

async function removeUserOrganization(formData: FormData) {
  "use server";

  await requireAccessAdmin();

  const supabase = createServiceSupabaseClient();

  const membershipId = String(formData.get("membership_id") || "");
  const platformUserId = String(formData.get("platform_user_id") || "");
  const organizationId = String(formData.get("organization_id") || "");

  let query = supabase.from("platform_user_organizations").delete();

  if (membershipId) {
    query = query.eq("id", membershipId);
  } else {
    query = query
      .eq("platform_user_id", platformUserId)
      .eq("organization_id", organizationId);
  }

  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/access");
}

export default async function AccessControlPage() {
  const currentUser = await requireAccessAdmin();
  const ownerEmail = String(process.env.PLATFORM_OWNER_EMAIL || "").toLowerCase();
  const supabase = createServiceSupabaseClient();

  const { data: users, error: usersError } = await supabase
    .from("platform_users")
    .select("*")
    .order("created_at", { ascending: false });

  if (usersError) {
    throw new Error(usersError.message);
  }

  const { data: organizations, error: orgsError } = await supabase
    .from("organizations")
    .select("*")
    .order("name", { ascending: true });

  if (orgsError) {
    throw new Error(orgsError.message);
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("platform_user_organizations")
    .select("*")
    .order("created_at", { ascending: false });

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const orgRows = (organizations || []) as AnyRow[];
  const userRows = (users || []) as AnyRow[];
  const membershipRows = (memberships || []) as AnyRow[];

  const orgById = new Map<string, AnyRow>(
    orgRows.map((org) => [String(org.id), org])
  );

  const membershipsByUser = new Map<string, AnyRow[]>();

  for (const membership of membershipRows) {
    const key = String(membership.platform_user_id);
    const existing = membershipsByUser.get(key) || [];
    existing.push(membership);
    membershipsByUser.set(key, existing);
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Access Control</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage real users, roles, organization access, carrier invitations,
          customer access, and suspensions. Changes here write directly to
          Supabase.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Owner protection:</strong>{" "}
        {ownerEmail || "PLATFORM_OWNER_EMAIL"} cannot be demoted, suspended, or
        disabled from this page.
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Create platform user</h2>
        <p className="mt-1 text-sm text-slate-600">
          After a user signs up through Clerk, copy their Clerk User ID here and
          assign their LaneForge role.
        </p>

        <form action={createPlatformUser} className="mt-4 grid gap-3 lg:grid-cols-5">
          <input
            name="clerk_user_id"
            placeholder="Clerk User ID"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <input
            name="email"
            placeholder="Email"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="platform_role"
            defaultValue="customer_user"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {roleOptions.map((role, index) => (
              <option key={`${role}-${index}`} value={role}>
                {role}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue="active"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="disabled">disabled</option>
          </select>
          <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            Create user
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Create organization</h2>
        <p className="mt-1 text-sm text-slate-600">
          Use customer for shippers/customers. Use carrier for LTL/FTL providers.
          Use 3pl for broker or managed logistics organizations.
        </p>

        <form action={createOrganization} className="mt-4 grid gap-3 lg:grid-cols-6">
          <input
            name="name"
            placeholder="Organization name"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm lg:col-span-2"
            required
          />
          <select
            name="organization_type"
            defaultValue="customer"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {organizationTypeOptions.map((type, index) => (
              <option key={`${type}-${index}`} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue="active"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="disabled">disabled</option>
          </select>
          <input
            name="brand_color"
            type="color"
            defaultValue="#f97316"
            className="h-10 rounded-xl border border-slate-300 px-2"
          />
          <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            Create organization
          </button>
          <input
            name="logo_url"
            placeholder="Logo URL"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm lg:col-span-3"
          />
          <input
            name="website_url"
            placeholder="Website URL"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm lg:col-span-3"
          />
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="font-semibold text-slate-950">Users</h2>
          <p className="mt-1 text-sm text-slate-600">
            Signed in as {currentUser.email || currentUser.clerk_user_id}
          </p>
        </div>

        <div className="divide-y divide-slate-200">
          {userRows.map((user) => {
            const userMemberships = membershipsByUser.get(String(user.id)) || [];
            const isOwner =
              ownerEmail && String(user.email || "").toLowerCase() === ownerEmail;

            return (
              <div key={user.id} className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {getUserLabel(user)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Clerk: {user.clerk_user_id}
                    </p>
                    <p className="text-xs text-slate-500">ID: {user.id}</p>
                    {isOwner && (
                      <p className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                        Protected owner
                      </p>
                    )}
                  </div>

                  <form action={savePlatformUser} className="grid gap-2 md:grid-cols-4">
                    <input type="hidden" name="platform_user_id" value={user.id} />
                    <input type="hidden" name="email" value={user.email || ""} />

                    <select
                      name="platform_role"
                      defaultValue={user.platform_role || "customer_user"}
                      disabled={Boolean(isOwner)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
                    >
                      {roleOptions.map((role, index) => (
                        <option key={`${user.id}-${role}-${index}`} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>

                    <select
                      name="status"
                      defaultValue={user.status || "active"}
                      disabled={Boolean(isOwner)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
                    >
                      <option value="active">active</option>
                      <option value="suspended">suspended</option>
                      <option value="disabled">disabled</option>
                    </select>

                    <button
                      disabled={Boolean(isOwner)}
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Save user
                    </button>
                  </form>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-semibold text-slate-950">
                    Organization access
                  </h3>

                  {userMemberships.length ? (
                    <div className="mt-3 space-y-2">
                      {userMemberships.map((membership) => {
                        const org = orgById.get(String(membership.organization_id));

                        return (
                          <div
                            key={
                              membership.id ||
                              `${membership.platform_user_id}-${membership.organization_id}`
                            }
                            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between"
                          >
                            <div>
                              <p className="font-semibold text-slate-950">
                                {org?.name || membership.organization_id}
                              </p>
                              <p className="text-xs text-slate-500">
                                {cleanOrgType(org?.organization_type)} -{" "}
                                {membership.organization_role || "member"} -{" "}
                                {membership.status || "active"}
                              </p>
                            </div>

                            <form action={removeUserOrganization}>
                              <input
                                type="hidden"
                                name="membership_id"
                                value={membership.id || ""}
                              />
                              <input
                                type="hidden"
                                name="platform_user_id"
                                value={membership.platform_user_id}
                              />
                              <input
                                type="hidden"
                                name="organization_id"
                                value={membership.organization_id}
                              />
                              <button className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
                                Remove
                              </button>
                            </form>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">
                      No organization access yet.
                    </p>
                  )}

                  <form action={linkUserToOrganization} className="mt-4 grid gap-2 md:grid-cols-3">
                    <input type="hidden" name="platform_user_id" value={user.id} />

                    <select
                      name="organization_id"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select organization</option>
                      {orgRows.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name} - {cleanOrgType(org.organization_type)}
                        </option>
                      ))}
                    </select>

                    <select
                      name="organization_role"
                      defaultValue="member"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    >
                      {organizationRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>

                    <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">
                      Link organization
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="font-semibold text-slate-950">Organizations</h2>
          <p className="mt-1 text-sm text-slate-600">
            Customer and shipper mean the same thing in LaneForge. New records
            should use customer.
          </p>
        </div>

        <div className="divide-y divide-slate-200">
          {orgRows.map((org) => (
            <form key={org.id} action={saveOrganization} className="p-5">
              <input type="hidden" name="organization_id" value={org.id} />

              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-2xl border text-lg font-bold"
                    style={{
                      borderColor: org.brand_color || "#cbd5e1",
                      color: org.brand_color || "#64748b",
                    }}
                  >
                    {org.logo_url ? (
                      <img
                        src={org.logo_url}
                        alt={org.name}
                        className="h-full w-full rounded-2xl object-contain"
                      />
                    ) : (
                      initials(org.name)
                    )}
                  </div>

                  <div>
                    <p className="font-semibold text-slate-950">{org.name}</p>
                    <p className="text-xs text-slate-500">
                      {cleanOrgType(org.organization_type)} - {org.status}
                    </p>
                    <p className="text-xs text-slate-500">ID: {org.id}</p>
                  </div>
                </div>

                <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                  Save organization
                </button>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-6">
                <input
                  name="name"
                  defaultValue={org.name || ""}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm lg:col-span-2"
                />

                <select
                  name="organization_type"
                  defaultValue={cleanOrgType(org.organization_type)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  {organizationTypeOptions.map((type, index) => (
                    <option key={`${org.id}-${type}-${index}`} value={type}>
                      {type}
                    </option>
                  ))}
                </select>

                <select
                  name="status"
                  defaultValue={org.status || "active"}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="disabled">disabled</option>
                </select>

                <input
                  name="brand_color"
                  type="color"
                  defaultValue={org.brand_color || "#f97316"}
                  className="h-10 rounded-xl border border-slate-300 px-2"
                />

                <div />

                <input
                  name="logo_url"
                  defaultValue={org.logo_url || ""}
                  placeholder="Logo URL"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm lg:col-span-3"
                />

                <input
                  name="website_url"
                  defaultValue={org.website_url || ""}
                  placeholder="Website URL"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm lg:col-span-3"
                />
              </div>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}