import { NextResponse } from "next/server";
import { buildRadar, readRadar } from "@/lib/radar";
import { latestJob, startAsyncJob } from "@/lib/jobs";
import { draftConfigured } from "@/lib/draft";

export const dynamic = "force-dynamic";
const SLUG = "radar"; // pseudo-slug for the job registry

export async function GET() {
  const radar = readRadar();
  return NextResponse.json({ radar, job: latestJob(SLUG), configured: draftConfigured() });
}

export async function POST() {
  if (!draftConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY is missing — add it to the .env file at the repo root and refresh the page" }, { status: 400 });
  try {
    const job = startAsyncJob(SLUG, "draft", async (report) => {
      await buildRadar(report);
    });
    return NextResponse.json({ job });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
