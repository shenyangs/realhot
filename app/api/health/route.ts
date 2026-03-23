import { NextResponse } from "next/server";
import { decideModelRoute } from "@/lib/services/model-router";

export async function GET() {
  const route = await decideModelRoute("content-generation", { feature: "content-generation" });

  return NextResponse.json({
    ok: true,
    app: "brand-hotspot-studio",
    modelRoute: route
  });
}
