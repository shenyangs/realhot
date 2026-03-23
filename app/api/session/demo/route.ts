import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "demo_mode_disabled"
    },
    {
      status: 410
    }
  );
}

export async function DELETE() {
  return NextResponse.json({
    ok: true
  });
}
