import { NextResponse } from "next/server";
import { getReviewQueue } from "@/lib/data";

export async function GET() {
  return NextResponse.json({
    contentPacks: await getReviewQueue()
  });
}
