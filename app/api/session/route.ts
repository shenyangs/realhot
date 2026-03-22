import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth/session";

export async function GET() {
  const viewer = await getCurrentViewer();

  return NextResponse.json({
    ok: true,
    viewer
  });
}
