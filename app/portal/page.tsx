import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const internalRoles = new Set([
  "owner",
  "admin",
  "pricing_admin",
  "pricing_manager",
  "pricing_director",
  "pricing_analyst",
  "internal_user",
]);

const customerRoles = new Set([
  "customer_admin",
  "customer_user",
  "shipper_admin",
  "shipper_user",
]);

const carrierRoles = new Set([
  "carrier_admin",
  "carrier_user",
]);

const threePlRoles = new Set([
  "3pl_admin",
  "3pl_user",
]);

export default async function PortalPage() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    redirect("/sign-in");
  }

  const supabase = createServiceSupabaseClient();

  const { data: platformUser, error } = await supabase
    .from("platform_users")
    .select("id, email, clerk_user_id, platform_role, status")
    .eq("clerk_user_id", clerkUser.id)
    .maybeSingle();

  if (error) {
    return (
      <PortalBlocked
        title="Access setup error"
        message="LaneForge could not verify your platform access."
        detail={error.message}
      />
    );
  }

  if (!platformUser) {
    return (
      <PortalBlocked
        title="Access blocked"
        message="Your account exists in Clerk, but it has not been created in LaneForge access control yet."
        detail={clerkUser.id}
      />
    );
  }

  if (platformUser.status !== "active") {
    return (
      <PortalBlocked
        title="Access blocked"
        message="Your LaneForge account is not active."
        detail={`Current status: ${platformUser.status}`}
      />
    );
  }

  const role = String(platformUser.platform_role || "");

  if (internalRoles.has(role)) {
    redirect("/dashboard");
  }

  if (threePlRoles.has(role)) {
    redirect("/rfps");
  }

  if (customerRoles.has(role)) {
    redirect("/customer/rfps");
  }

  if (carrierRoles.has(role)) {
    redirect("/carrier/rfps");
  }

  return (
    <PortalBlocked
      title="Bad role"
      message="Your account is active, but the platform role is not recognized."
      detail={role}
    />
  );
}

function PortalBlocked({
  title,
  message,
  detail,
}: {
  title: string;
  message: string;
  detail?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-4 leading-7 text-slate-200">{message}</p>

        {detail ? (
          <pre className="mt-5 overflow-auto rounded-xl bg-white p-4 text-sm text-slate-950">
            {detail}
          </pre>
        ) : null}

        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 font-semibold text-slate-950"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}