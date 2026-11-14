import { NextResponse } from "next/server";
import { getJob, tailLog } from "@/lib/jobs";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  return NextResponse.json({ job, log: tailLog(job) });
}
