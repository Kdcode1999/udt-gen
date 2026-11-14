import { NextResponse } from "next/server";
import { createVideo, listVideos } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ videos: listVideos() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { title?: string; from?: string };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  try {
    const slug = createVideo(title, body.from);
    return NextResponse.json({ slug });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
