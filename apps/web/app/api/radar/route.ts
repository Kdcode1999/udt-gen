import { NextResponse } from "next/server";
import { buildRadar, readRadar } from "@/lib/radar";
import { latestJob, startAsyncJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
const SLUG = "radar"; // pseudo-slug for the job registry

export async function GET() {
  const radar = readRadar();
  return NextResponse.json({ radar, job: latestJob(SLUG), configured: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the machine running the app" }, { status: 400 });
  try {
    const job = startAsyncJob(SLUG, "draft", async (report) => {
      await buildRadar(report);
    });
    return NextResponse.json({ job });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
