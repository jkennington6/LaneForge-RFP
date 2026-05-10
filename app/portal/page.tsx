import { redirect } from "next/navigation";
import {
  getCurrentPlatformUser,
  is3plRole,
  isCarrierRole,
  isCustomerRole,
  isInternalRole,
} from "@/lib/portal-access";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const user = await getCurrentPlatformUser();

  if (!user) {
    redirect("/unauthorized");
  }

  if (user.status !== "active" && user.status !== "protected") {
    redirect("/unauthorized");
  }

  if (isInternalRole(user.platform_role)) {
    redirect("/dashboard");
  }

  if (is3plRole(user.platform_role)) {
    redirect("/3pl/dashboard");
  }

  if (isCustomerRole(user.platform_role)) {
    redirect("/customer/rfps");
  }

  if (isCarrierRole(user.platform_role)) {
    redirect("/carrier/rfps");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-2xl font-bold">Unknown role</h1>
        <p className="mt-2">
          Your account exists, but the platform role is not recognized.
        </p>
        <pre className="mt-4 rounded-xl bg-white p-4 text-sm">
          {user.platform_role}
        </pre>
      </div>
    </main>
  );
}