import { NextResponse } from "next/server";
import { decideModelRoute } from "@/lib/services/model-router";

export function GET() {
  const route = decideModelRoute("content-generation");

  return NextResponse.json({
    ok: true,
    app: "brand-hotspot-studio",
    modelRoute: route
  });
}
