import { NextResponse } from "next/server";
import { isScanId, setKept } from "@/lib/radarStore";

export const dynamic = "force-dynamic";

/** POST { scanId, index, keep } or { key, keep:false } → { kept } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { scanId?: string; index?: number; key?: string; keep?: boolean };
  const keep = body.keep !== false;
  if (typeof body.key === "string" && !keep) return NextResponse.json({ kept: setKept({ key: body.key }, false) });
  if (!isScanId(body.scanId) || !Number.isInteger(body.index)) return NextResponse.json({ error: "scanId and index required" }, { status: 400 });
  return NextResponse.json({ kept: setKept({ scanId: body.scanId, index: body.index as number }, keep) });
}
