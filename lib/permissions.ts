export type PlatformRole = "owner" | "platform_admin" | "customer_admin" | "customer_user" | "carrier_admin" | "carrier_user";
export type UserStatus = "active" | "suspended" | "disabled";

export function isPlatformOwner(email: string | null | undefined) {
  return Boolean(email && process.env.PLATFORM_OWNER_EMAIL && email.toLowerCase() === process.env.PLATFORM_OWNER_EMAIL.toLowerCase());
}

export function canManageUsers(role: PlatformRole) {
  return role === "owner" || role === "platform_admin";
}

export function canSuspendUser(actorRole: PlatformRole, targetRole: PlatformRole) {
  if (targetRole === "owner") return false;
  return actorRole === "owner" || actorRole === "platform_admin";
}

export function assertActiveUser(status: UserStatus) {
  if (status !== "active") {
    throw new Error("Your access has been suspended or disabled. Contact the platform owner.");
  }
}
