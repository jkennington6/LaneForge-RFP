import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ rfpId: string }> }
) {
  const { userId } = await auth();
  const { rfpId } = await params;

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const supabase = createServiceSupabaseClient();

  const { data: appUser, error: userError } = await supabase
    .from("app_users")
    .select("id, is_platform_owner, status")
    .eq("clerk_user_id", userId)
    .single();

  if (userError || !appUser) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 403 }
    );
  }

  if (appUser.status !== "active") {
    return NextResponse.json(
      { error: "User inactive." },
      { status: 403 }
    );
  }

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .select("id")
    .eq("id", rfpId)
    .is("deleted_at", null)
    .single();

  if (rfpError || !rfp) {
    return NextResponse.json(
      { error: "RFP not found." },
      { status: 404 }
    );
  }

  const { error: updateError } = await supabase
    .from("rfps")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: appUser.id,
    })
    .eq("id", rfpId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
  });
}
