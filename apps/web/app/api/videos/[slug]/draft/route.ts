import { NextResponse } from "next/server";
import { isSlug, readScriptRaw, writeScript } from "@/lib/store";
import { runCli, startAsyncJob } from "@/lib/jobs";
import { draftConfigured, draftModel, draftScript, writeResearch } from "@/lib/draft";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

export async function GET() {
  return NextResponse.json({ configured: draftConfigured(), model: draftModel() });
}

export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!isSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 });
  if (!draftConfigured()) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the machine running the app" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { brief?: string; lengthSec?: number; title?: string; series?: string };
  const current = readScriptRaw(slug) as { title?: string; series?: string } | null;
  const title = body.title?.trim() || current?.title || slug;
  const lengthSec = Math.min(180, Math.max(30, Number(body.lengthSec) || 60));
  try {
    const job = startAsyncJob(slug, "draft", async (report) => {
      const { script, research } = await draftScript({ slug, title, brief: body.brief ?? "", lengthSec, series: body.series ?? current?.series }, report);
      writeScript(slug, script);
      if (research) writeResearch(slug, research);
      report(`draft saved: ${script.scenes.length} scenes — check the research notes before voicing`);
    });
    return NextResponse.json({ job });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
