// Serves files from videos/<slug>/ (assets, vo, out) to the preview player and the browser.
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { isSlug, safeFile } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string; path: string[] }> };

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac",
  ".json": "application/json", ".srt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

export async function GET(req: Request, { params }: Ctx) {
  const { slug, path: parts } = await params;
  if (!isSlug(slug)) return new NextResponse("bad slug", { status: 400 });
  const rel = parts.map(decodeURIComponent).join("/");
  if (!/^(assets|vo|out)\//.test(rel)) return new NextResponse("forbidden", { status: 403 });
  let abs: string;
  try {
    abs = safeFile(slug, rel);
  } catch {
    return new NextResponse("forbidden", { status: 403 });
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return new NextResponse("not found", { status: 404 });
  const size = fs.statSync(abs).size;
  const type = MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.get("range");
  const headers: Record<string, string> = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-cache" };
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m && m[1] ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    const stream = fs.createReadStream(abs, { start, end });
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  const stream = fs.createReadStream(abs);
  return new NextResponse(stream as unknown as ReadableStream, { headers: { ...headers, "content-length": String(size) } });
}
