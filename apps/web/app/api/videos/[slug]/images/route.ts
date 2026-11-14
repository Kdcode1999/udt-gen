import { NextResponse } from "next/server";
import { isSlug } from "@/lib/store";
import { startJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!isSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY is not set on the machine running the app" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const args: string[] = [];
  if (body.force) args.push("--force");
  if (body.only) args.push("--only", String(body.only));
  if (body.style) args.push("--style", String(body.style));
  try {
    const job = startJob(slug, "images", args);
    return NextResponse.json({ job });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
