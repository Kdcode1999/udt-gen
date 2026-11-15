import { NextResponse } from "next/server";
import { draftConfigured, draftModel } from "@/lib/draft";
import { refreshKeys } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  refreshKeys();
  return NextResponse.json({
    anthropic: draftConfigured(),
    model: draftModel(),
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    youtube: !!process.env.YOUTUBE_API_KEY,
    edge: true,
  });
}
