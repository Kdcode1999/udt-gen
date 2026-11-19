import { NextResponse } from "next/server";
import { createVideo, listVideos, writeScript } from "@/lib/store";
import { runCli, startAsyncJob } from "@/lib/jobs";
import { draftConfigured, draftScript, writeResearch } from "@/lib/draft";
import { isScanId, markDrafted } from "@/lib/radarStore";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ videos: listVideos() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { title?: string; from?: string; draft?: boolean; brief?: string; lengthSec?: number; series?: string; radar?: { scanId?: string; index?: number } };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  try {
    const slug = createVideo(title, body.from);
    // started from a radar topic → mark it on that scan so the Topics page links here
    if (body.radar && isScanId(body.radar.scanId) && Number.isInteger(body.radar.index)) markDrafted({ scanId: body.radar.scanId, index: body.radar.index as number }, slug);
    if (body.draft) {
      if (!draftConfigured()) return NextResponse.json({ error: "No AI key — add OPENAI_API_KEY (or ANTHROPIC_API_KEY) to the .env file at the repo root" }, { status: 400 });
      const lengthSec = Math.min(180, Math.max(30, Number(body.lengthSec) || 60));
      const job = startAsyncJob(slug, "draft", async (report) => {
        const { script, research } = await draftScript({ slug, title, brief: body.brief ?? "", lengthSec, series: body.series }, report);
        writeScript(slug, script);
        if (research) writeResearch(slug, research);
        report(`draft saved: ${script.scenes.length} scenes`);
        if (process.env.OPENAI_API_KEY && script.scenes.some((sc) => sc.type === "hook" || (sc.type === "image" && !sc.src) || (sc.type === "board" && sc.card && !sc.card.img) || sc.visuals?.some((v) => !v.src))) {
          report("generating images…");
          await runCli(slug, "images", [], report);
        }
        report(`draft ready: ${script.scenes.length} scenes — check the research notes before voicing`);
      });
      return NextResponse.json({ slug, job });
    }
    return NextResponse.json({ slug });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
