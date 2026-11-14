import { NextResponse } from "next/server";
import { isSlug, listAssets, saveAsset } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!isSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 });
  return NextResponse.json({ assets: listAssets(slug) });
}

export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!isSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 });
  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "no file" }, { status: 400 });
  const saved = [];
  for (const f of files) saved.push(await saveAsset(slug, f));
  return NextResponse.json({ saved, assets: listAssets(slug) });
}
