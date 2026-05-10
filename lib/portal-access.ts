import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/supabase";

export type PlatformUser = {
  id: string;
  clerk_user_id?: string | null;
  email?: string | null;
  platform_role: string;
  status?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export type PlatformUserRow = PlatformUser;

export type ClerkIdentity = {
  clerkUserId: string | null;
  email: string | null;
  fullName: string | null;
};

const UNAUTHORIZED_PATH = "/unauthorized";

function clean(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizePlatformRole(role: unknown) {
  const value = clean(role);

  const aliases: Record<string, string> = {
    super_admin: "owner",
    platform_owner: "owner",
    platform_admin: "admin",

    shipper: "customer_user",
    shipper_user: "customer_user",
    shipper_admin: "customer_admin",
    customer: "customer_user",

    third_party_logistics_admin: "3pl_admin",
    third_party_logistics_user: "3pl_user",
    threepl_admin: "3pl_admin",
    threepl_user: "3pl_user",
    "3_pl_admin": "3pl_admin",
    "3_pl_user": "3pl_user",

    carrier: "carrier_user",
    carrier_member: "carrier_user",
  };

  return aliases[value] ?? value;
}

export function normalizeOrganizationType(type: unknown) {
  const value = clean(type);

  const aliases: Record<string, string> = {
    shipper: "customer",
    customer_shipper: "customer",
    shipper_customer: "customer",
    "3_pl": "3pl",
    threepl: "3pl",
    third_party_logistics: "3pl",
  };

  return aliases[value] ?? value;
}

export function isInternalRole(role: unknown) {
  const normalized = normalizePlatformRole(role);

  return [
    "owner",
    "admin",
    "pricing_admin",
    "pricing_manager",
    "pricing_director",
    "pricing_analyst",
    "internal_user",
  ].includes(normalized);
}

export function is3plRole(role: unknown) {
  const normalized = normalizePlatformRole(role);

  return ["3pl_admin", "3pl_user"].includes(normalized);
}

export function isCustomerRole(role: unknown) {
  const normalized = normalizePlatformRole(role);

  return ["customer_admin", "customer_user"].includes(normalized);
}

export function isCarrierRole(role: unknown) {
  const normalized = normalizePlatformRole(role);

  return ["carrier_admin", "carrier_user"].includes(normalized);
}

export async function getCurrentClerkIdentity(): Promise<ClerkIdentity> {
  const authResult = await auth();
  const clerkUserId = authResult.userId ?? null;

  if (!clerkUserId) {
    return {
      clerkUserId: null,
      email: null,
      fullName: null,
    };
  }

  const user = await currentUser();

  const email =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ??
    null;

  const fullName =
    user?.fullName ??
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ??
    null;

  return {
    clerkUserId,
    email,
    fullName,
  };
}

function isActiveStatus(status: unknown) {
  const value = clean(status);
  return value === "active" || value === "protected";
}

export async function getCurrentPlatformUser(): Promise<PlatformUser | null> {
  const identity = await getCurrentClerkIdentity();

  if (!identity.clerkUserId) {
    return null;
  }

  const supabase = createServiceSupabaseClient();

  const { data: byClerkId, error: clerkError } = await supabase
    .from("platform_users")
    .select("*")
    .eq("clerk_user_id", identity.clerkUserId)
    .limit(1)
    .maybeSingle();

  if (clerkError) {
    throw new Error(clerkError.message);
  }

  if (byClerkId) {
    return byClerkId as PlatformUser;
  }

  if (!identity.email) {
    return null;
  }

  const { data: byEmail, error: emailError } = await supabase
    .from("platform_users")
    .select("*")
    .eq("email", identity.email)
    .limit(1)
    .maybeSingle();

  if (emailError) {
    throw new Error(emailError.message);
  }

  if (!byEmail) {
    return null;
  }

  const platformUser = byEmail as PlatformUser;

  if (!platformUser.clerk_user_id) {
    const { error: linkError } = await supabase
      .from("platform_users")
      .update({ clerk_user_id: identity.clerkUserId })
      .eq("id", platformUser.id);

    if (linkError) {
      throw new Error(linkError.message);
    }

    platformUser.clerk_user_id = identity.clerkUserId;
  }

  return platformUser;
}

export async function requirePlatformUser() {
  const user = await getCurrentPlatformUser();

  if (!user) {
    redirect(UNAUTHORIZED_PATH);
  }

  return user;
}

export async function requireActivePlatformUser() {
  const user = await requirePlatformUser();

  if (!isActiveStatus(user.status)) {
    redirect(UNAUTHORIZED_PATH);
  }

  return user;
}

export async function requireInternalPlatformUser() {
  const user = await requireActivePlatformUser();

  if (!isInternalRole(user.platform_role)) {
    redirect("/portal");
  }

  return user;
}

export async function requireAccessAdmin() {
  const user = await requireActivePlatformUser();

  const role = normalizePlatformRole(user.platform_role);

  if (
    ![
      "owner",
      "admin",
      "pricing_admin",
      "pricing_manager",
      "pricing_director",
    ].includes(role)
  ) {
    redirect(UNAUTHORIZED_PATH);
  }

  return user;
}

export async function requirePricingUser() {
  const user = await requireActivePlatformUser();

  if (!isInternalRole(user.platform_role)) {
    redirect(UNAUTHORIZED_PATH);
  }

  return user;
}

export async function require3plPortalUser() {
  const user = await requireActivePlatformUser();

  if (!is3plRole(user.platform_role) && !isInternalRole(user.platform_role)) {
    redirect(UNAUTHORIZED_PATH);
  }

  return user;
}

export async function requireCustomerPortalUser() {
  const user = await requireActivePlatformUser();

  if (!isCustomerRole(user.platform_role) && !isInternalRole(user.platform_role)) {
    redirect(UNAUTHORIZED_PATH);
  }

  return user;
}

export async function requireCarrierPortalUser() {
  const user = await requireActivePlatformUser();

  if (!isCarrierRole(user.platform_role) && !isInternalRole(user.platform_role)) {
    redirect(UNAUTHORIZED_PATH);
  }

  return user;
}

async function getOrganizationIdsByType(allowedTypes: string[]) {
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, organization_type, status")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .filter((org: any) => isActiveStatus(org.status))
    .filter((org: any) =>
      allowedTypes.includes(normalizeOrganizationType(org.organization_type))
    )
    .map((org: any) => String(org.id));
}

async function getOrgIdsForCurrentUser(
  userInput: PlatformUser | null | undefined,
  allowedTypes: string[]
) {
  const user = userInput ?? (await requireActivePlatformUser());

  if (isInternalRole(user.platform_role)) {
    return getOrganizationIdsByType(allowedTypes);
  }

  const supabase = createServiceSupabaseClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("platform_user_organizations")
    .select("organization_id, status")
    .eq("platform_user_id", user.id);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const activeOrgIds = (memberships ?? [])
    .filter((membership: any) => isActiveStatus(membership.status))
    .map((membership: any) => String(membership.organization_id))
    .filter(Boolean);

  if (!activeOrgIds.length) {
    return [];
  }

  const { data: organizations, error: orgError } = await supabase
    .from("organizations")
    .select("id, organization_type, status")
    .in("id", activeOrgIds);

  if (orgError) {
    throw new Error(orgError.message);
  }

  return (organizations ?? [])
    .filter((org: any) => isActiveStatus(org.status))
    .filter((org: any) =>
      allowedTypes.includes(normalizeOrganizationType(org.organization_type))
    )
    .map((org: any) => String(org.id));
}

export async function get3plOrgIdsForCurrentUser(user?: PlatformUser | null) {
  return getOrgIdsForCurrentUser(user, ["3pl"]);
}

export async function getCustomerOrgIdsForCurrentUser(
  user?: PlatformUser | null
) {
  return getOrgIdsForCurrentUser(user, ["customer"]);
}

export async function getCarrierOrgIdsForCurrentUser(
  user?: PlatformUser | null
) {
  return getOrgIdsForCurrentUser(user, ["carrier"]);
}

export async function assert3plOrgAccess(
  organizationId: string,
  userInput?: PlatformUser | null
) {
  const user = userInput ?? (await requireActivePlatformUser());

  if (isInternalRole(user.platform_role)) {
    return;
  }

  const allowedOrgIds = await get3plOrgIdsForCurrentUser(user);

  if (!allowedOrgIds.includes(organizationId)) {
    throw new Error("Access denied: 3PL organization is not linked to this user.");
  }
}

export async function assertCustomerOrgAccess(
  organizationId: string,
  userInput?: PlatformUser | null
) {
  const user = userInput ?? (await requireActivePlatformUser());

  if (isInternalRole(user.platform_role)) {
    return;
  }

  const allowedOrgIds = await getCustomerOrgIdsForCurrentUser(user);

  if (!allowedOrgIds.includes(organizationId)) {
    throw new Error("Access denied: customer organization is not linked to this user.");
  }
}

export async function assertCarrierOrgAccess(
  organizationId: string,
  userInput?: PlatformUser | null
) {
  const user = userInput ?? (await requireActivePlatformUser());

  if (isInternalRole(user.platform_role)) {
    return;
  }

  const allowedOrgIds = await getCarrierOrgIdsForCurrentUser(user);

  if (!allowedOrgIds.includes(organizationId)) {
    throw new Error("Access denied: carrier organization is not linked to this user.");
  }
}