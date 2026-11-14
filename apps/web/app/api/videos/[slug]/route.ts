import { NextResponse } from "next/server";
import { Script } from "@utd/video/schema";
import { isSlug, listAssets, listOutputs, readScriptRaw, readVo, writeScript } from "@/lib/store";
import { latestJob } from "@/lib/jobs";
import { draftConfigured, readResearch } from "@/lib/draft";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!isSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 });
  const raw = readScriptRaw(slug);
  if (!raw) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Script.safeParse(raw);
  return NextResponse.json({
    slug,
    script: raw,
    valid: parsed.success,
    issues: parsed.success ? [] : parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    vo: readVo(slug),
    assets: listAssets(slug),
    outputs: listOutputs(slug),
    job: latestJob(slug),
    research: readResearch(slug),
    draftConfigured: draftConfigured(),
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!isSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const parsed = Script.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid script", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }
  writeScript(slug, { ...parsed.data, id: slug });
  return NextResponse.json({ ok: true });
}
