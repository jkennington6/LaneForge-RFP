import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, app: "LaneForge RFP", timestamp: new Date().toISOString() });
}
