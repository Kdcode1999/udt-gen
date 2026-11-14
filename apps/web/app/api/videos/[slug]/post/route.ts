import { NextResponse } from "next/server";
import { isSlug } from "@/lib/store";
import { startJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  if (!isSlug(slug)) return NextResponse.json({ error: "bad slug" }, { status: 400 });
  try {
    return NextResponse.json({ job: startJob(slug, "post", []) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
