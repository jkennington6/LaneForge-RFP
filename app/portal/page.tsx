import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const supabase = createServiceSupabaseClient();

  const { data: user, error } = await supabase
    .from("platform_users")
    .select("id, email, clerk_user_id, platform_role, status")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!user || user.status !== "active") {
    redirect("/access-blocked");
  }

  const role = String(user.platform_role || "").toLowerCase();

  if (
    role === "owner" ||
    role === "admin" ||
    role === "pricing_admin" ||
    role === "pricing_manager" ||
    role === "pricing_director" ||
    role === "pricing_analyst" ||
    role === "internal_user"
  ) {
    redirect("/dashboard");
  }

  if (role === "3pl_admin" || role === "3pl_user") {
    redirect("/dashboard");
  }

  if (role === "customer_admin" || role === "customer_user") {
    redirect("/customer/rfps");
  }

  if (role === "carrier_admin" || role === "carrier_user") {
    redirect("/carrier/rfps");
  }

  redirect("/access-blocked");
}
