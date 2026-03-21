import { NextResponse } from "next/server";
import { getPrioritizedHotspots } from "@/lib/data";

export async function GET() {
  return NextResponse.json({
    hotspots: await getPrioritizedHotspots()
  });
}
