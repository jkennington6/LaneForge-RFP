import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SectionHeader } from "@/components/section-header";
import { createServiceSupabaseClient } from "@/lib/supabase";
import { getCurrentClerkIdentity } from "@/lib/access";

async function claimOwner() {
  "use server";

  const identity = await getCurrentClerkIdentity();

  if (!identity) {
    throw new Error("You must be logged in.");
  }

  const supabase = createServiceSupabaseClient();

  const { count, error: countError } = await supabase
    .from("platform_users")
    .select("id", { count: "exact", head: true })
    .eq("platform_role", "platform_owner");

  if (countError) {
    throw new Error(countError.message);
  }

  if ((count ?? 0) > 0) {
    throw new Error("A platform owner already exists.");
  }

  const { error } = await supabase.from("platform_users").insert({
    clerk_user_id: identity.clerkUserId,
    email: identity.email,
    full_name: identity.fullName,
    platform_role: "platform_owner",
    status: "active",
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/access");
  redirect("/admin/access");
}

export default async function SetupOwnerPage() {
  const identity = await getCurrentClerkIdentity();
  const supabase = createServiceSupabaseClient();

  const { count } = await supabase
    .from("platform_users")
    .select("id", { count: "exact", head: true })
    .eq("platform_role", "platform_owner");

  const ownerExists = (count ?? 0) > 0;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <SectionHeader
        title="Setup Platform Owner"
        description="Claim the first and only owner account for this RFP platform."
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {ownerExists ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            A platform owner already exists. This setup page is now locked.
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              You are about to make the currently logged-in user the platform owner.
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Clerk User ID:</span>{" "}
                {identity?.clerkUserId ?? "Not logged in"}
              </p>
              <p>
                <span className="font-semibold">Email:</span>{" "}
                {identity?.email ?? "No email found"}
              </p>
              <p>
                <span className="font-semibold">Name:</span>{" "}
                {identity?.fullName ?? "No name found"}
              </p>
            </div>

            <form action={claimOwner}>
              <button
                type="submit"
                className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Claim platform owner
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
