import { auth } from "@clerk/nextjs/server";
import { createServiceSupabaseClient } from "@/lib/supabase";

type AccessResult =
  | {
      allowed: true;
      supabase: ReturnType<typeof createServiceSupabaseClient>;
      appUser: Record<string, any>;
      rfp: Record<string, any>;
    }
  | {
      allowed: false;
      status: number;
      error: string;
    };

const allowedMembershipRoles = [
  "owner",
  "admin",
  "platform_admin",
  "internal_admin",
  "customer_admin",
  "3pl_admin",
  "carrier_admin",
];

const allowedAppRoles = [
  "owner",
  "admin",
  "platform_admin",
  "internal_admin",
  "super_admin",
];

function collectPossibleOrgIds(rfp: Record<string, any>) {
  const orgIds = new Set<string>();

  const possibleKeys = [
    "organization_id",
    "customer_organization_id",
    "owner_organization_id",
    "managing_organization_id",
    "managed_by_organization_id",
    "three_pl_organization_id",
    "threpl_organization_id",
    "third_party_organization_id",
  ];

  possibleKeys.forEach((key) => {
    const value = rfp[key];

    if (typeof value === "string" && value.trim()) {
      orgIds.add(value);
    }
  });

  const customer = Array.isArray(rfp.customers) ? rfp.customers[0] : rfp.customers;

  if (customer?.organization_id) {
    orgIds.add(String(customer.organization_id));
  }

  return Array.from(orgIds);
}

export async function requireRfpExportAccess(rfpId: string): Promise<AccessResult> {
  const { userId } = await auth();

  if (!userId) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const supabase = createServiceSupabaseClient();

  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (appUserError || !appUser) {
    return {
      allowed: false,
      status: 403,
      error: "User is not registered in LaneForge.",
    };
  }

  if (appUser.status && appUser.status !== "active") {
    return {
      allowed: false,
      status: 403,
      error: "User is not active.",
    };
  }

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .select(`
      *,
      customers (
        id,
        organization_id
      )
    `)
    .eq("id", rfpId)
    .is("deleted_at", null)
    .maybeSingle();

  if (rfpError || !rfp) {
    return {
      allowed: false,
      status: 404,
      error: "RFP not found.",
    };
  }

  if (appUser.is_platform_owner === true) {
    return {
      allowed: true,
      supabase,
      appUser,
      rfp,
    };
  }

  if (typeof appUser.role === "string" && allowedAppRoles.includes(appUser.role)) {
    return {
      allowed: true,
      supabase,
      appUser,
      rfp,
    };
  }

  const orgIds = collectPossibleOrgIds(rfp);

  if (!orgIds.length) {
    return {
      allowed: false,
      status: 403,
      error: "RFP organization could not be verified.",
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, role, status, organization_id")
    .eq("user_id", appUser.id)
    .eq("status", "active")
    .in("organization_id", orgIds)
    .in("role", allowedMembershipRoles)
    .maybeSingle();

  if (membershipError || !membership) {
    return {
      allowed: false,
      status: 403,
      error: "You do not have permission to export this RFP.",
    };
  }

  return {
    allowed: true,
    supabase,
    appUser,
    rfp,
  };
}