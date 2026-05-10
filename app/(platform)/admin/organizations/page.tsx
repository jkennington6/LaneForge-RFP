import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalPlatformUser } from "@/lib/portal-access";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

const accessAdminRoles = new Set([
  "owner",
  "admin",
  "pricing_admin",
  "pricing_manager",
  "pricing_director",
]);

const organizationTypes = [
  { value: "internal", label: "Internal" },
  { value: "3pl", label: "3PL" },
  { value: "customer", label: "Customer" },
  { value: "carrier", label: "Carrier" },
];

const statuses = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "disabled", label: "Disabled" },
];

function normalizeOrganizationType(value: unknown) {
  const cleanValue = String(value || "").trim().toLowerCase();
  const allowed = organizationTypes.map((type) => type.value);

  if (allowed.includes(cleanValue)) {
    return cleanValue;
  }

  return "customer";
}

function normalizeStatus(value: unknown) {
  const cleanValue = String(value || "").trim().toLowerCase();
  const allowed = statuses.map((status) => status.value);

  if (allowed.includes(cleanValue)) {
    return cleanValue;
  }

  return "active";
}

function getTypeLabel(value: unknown) {
  const cleanValue = normalizeOrganizationType(value);
  return organizationTypes.find((type) => type.value === cleanValue)?.label || cleanValue;
}

async function requireOrgAdmin() {
  const user = await requireInternalPlatformUser();

  if (!accessAdminRoles.has(user.platform_role)) {
    redirect("/unauthorized");
  }

  return user;
}

async function createOrganization(formData: FormData) {
  "use server";

  await requireOrgAdmin();

  const supabase = createServiceSupabaseClient();

  const name = String(formData.get("name") || "").trim();
  const organizationType = normalizeOrganizationType(formData.get("organization_type"));
  const status = normalizeStatus(formData.get("status"));
  const logoUrl = String(formData.get("logo_url") || "").trim() || null;
  const brandColor = String(formData.get("brand_color") || "#f97316").trim() || "#f97316";
  const websiteUrl = String(formData.get("website_url") || "").trim() || null;

  if (!name) {
    throw new Error("Organization name is required.");
  }

  const { error } = await supabase.from("organizations").insert({
    name,
    organization_type: organizationType,
    status,
    logo_url: logoUrl,
    brand_color: brandColor,
    website_url: websiteUrl,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/organizations");
  revalidatePath("/admin/access");
}

async function updateOrganization(formData: FormData) {
  "use server";

  await requireOrgAdmin();

  const supabase = createServiceSupabaseClient();

  const organizationId = String(formData.get("organization_id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const organizationType = normalizeOrganizationType(formData.get("organization_type"));
  const status = normalizeStatus(formData.get("status"));
  const logoUrl = String(formData.get("logo_url") || "").trim() || null;
  const brandColor = String(formData.get("brand_color") || "#f97316").trim() || "#f97316";
  const websiteUrl = String(formData.get("website_url") || "").trim() || null;

  if (!organizationId || !name) {
    throw new Error("Organization ID and name are required.");
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      organization_type: organizationType,
      status,
      logo_url: logoUrl,
      brand_color: brandColor,
      website_url: websiteUrl,
    })
    .eq("id", organizationId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/organizations");
  revalidatePath("/admin/access");
  revalidatePath("/customer/rfps");
  revalidatePath("/carrier/rfps");
}

export default async function OrganizationsPage() {
  await requireOrgAdmin();

  const supabase = createServiceSupabaseClient();

  const { data: organizations, error } = await supabase
    .from("organizations")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <main className="p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Organizations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage real customer, carrier, 3PL, and internal organization records.
          Logos and colors set here will display in the customer and carrier portals.
        </p>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Create organization</h2>

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
            {organizationTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>

          <select
            name="status"
            defaultValue="active"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>

          <input
            name="brand_color"
            type="color"
            defaultValue="#f97316"
            className="h-10 rounded-xl border border-slate-300 px-2 py-1"
          />

          <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            Create
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

      <section className="mt-6 space-y-4">
        {(organizations || []).map((org: AnyRow) => {
          const orgType = normalizeOrganizationType(org.organization_type);
          const orgStatus = normalizeStatus(org.status);

          return (
            <form
              key={org.id}
              action={updateOrganization}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <input type="hidden" name="organization_id" value={org.id} />

              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border bg-slate-50"
                    style={{ borderColor: org.brand_color || "#e2e8f0" }}
                  >
                    {org.logo_url ? (
                      <img
                        src={org.logo_url}
                        alt={org.name}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <span className="text-lg font-bold text-slate-400">
                        {String(org.name || "?").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div>
                    <h2 className="font-semibold text-slate-950">{org.name}</h2>
                    <p className="text-xs text-slate-500">
                      {getTypeLabel(orgType)} Â· {orgStatus}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">ID: {org.id}</p>
                  </div>
                </div>

                <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                  Save organization
                </button>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-6">
                <input
                  name="name"
                  defaultValue={org.name || ""}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm lg:col-span-2"
                  required
                />

                <select
                  key={`${org.id}-${orgType}`}
                  name="organization_type"
                  defaultValue={orgType}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  {organizationTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>

                <select
                  key={`${org.id}-${orgStatus}`}
                  name="status"
                  defaultValue={orgStatus}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>

                <input
                  name="brand_color"
                  type="color"
                  defaultValue={org.brand_color || "#f97316"}
                  className="h-10 rounded-xl border border-slate-300 px-2 py-1"
                />

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Brand color
                </div>

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
          );
        })}

        {!(organizations || []).length && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No organizations exist yet.
          </div>
        )}
      </section>
    </main>
  );
}