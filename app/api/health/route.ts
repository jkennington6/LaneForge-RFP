import { createServiceSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type HealthCheck = {
  name: string;
  status: "ok" | "error";
  detail: string;
};

async function checkTable(table: string): Promise<HealthCheck> {
  try {
    const supabase = createServiceSupabaseClient();

    const { error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      return {
        name: table,
        status: "error",
        detail: error.message,
      };
    }

    return {
      name: table,
      status: "ok",
      detail: "reachable",
    };
  } catch (error) {
    return {
      name: table,
      status: "error",
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function GET() {
  const checks = await Promise.all([
    checkTable("rfps"),
    checkTable("organizations"),
    checkTable("customers"),
    checkTable("shipment_lanes"),
    checkTable("rfp_carrier_invites"),
    checkTable("carrier_bid_submissions"),
    checkTable("carrier_bid_lane_rates"),
    checkTable("rfp_lane_awards"),
    checkTable("rfp_customer_release_settings"),
  ]);

  const hasError = checks.some((check) => check.status === "error");

  return Response.json(
    {
      status: hasError ? "error" : "ok",
      service: "LaneForge",
      timestamp: new Date().toISOString(),
      checks,
    },
    {
      status: hasError ? 500 : 200,
    }
  );
}