import { NextResponse } from "next/server";
import { buildRadar } from "@/lib/radar";
import { listKept, listScans, readScan } from "@/lib/radarStore";
import { latestJob, startAsyncJob } from "@/lib/jobs";
import { draftConfigured } from "@/lib/draft";

export const dynamic = "force-dynamic";
const SLUG = "radar"; // pseudo-slug for the job registry

/** GET /api/radar[?scan=<id>] → the scan history, one scan (newest by default), the kept list and the running job. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("scan");
  return NextResponse.json({ scans: listScans(), radar: readScan(id), kept: listKept(), job: latestJob(SLUG), configured: draftConfigured() });
}

export async function POST() {
  if (!draftConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY is missing — add it to the .env file at the repo root and refresh the page" }, { status: 400 });
  try {
    const job = startAsyncJob(SLUG, "radar", async (report) => {
      await buildRadar(report);
    });
    return NextResponse.json({ job });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
