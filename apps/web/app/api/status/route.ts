import { NextResponse } from "next/server";
import { draftConfigured, draftModel } from "@/lib/draft";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    anthropic: draftConfigured(),
    model: draftModel(),
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    edge: true,
  });
}
