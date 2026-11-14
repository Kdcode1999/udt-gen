// Filesystem store: everything lives in <repo>/videos/<slug>/ exactly as the CLI expects.
// Phase 2b swaps this file for Neon + R2 without touching the routes or UI.
import fs from "node:fs";
import path from "node:path";
import { Script, type Script as ScriptT, type VoManifest as VoManifestT } from "@utd/video/schema";

export const REPO_DIR = process.env.UTD_REPO_DIR ? path.resolve(process.env.UTD_REPO_DIR) : path.resolve(process.cwd(), "..", "..");
export const VIDEOS_DIR = process.env.UTD_VIDEOS_DIR ? path.resolve(process.env.UTD_VIDEOS_DIR) : path.join(REPO_DIR, "videos");
export const PKG_DIR = path.join(REPO_DIR, "packages", "video");

const SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/;
export const isSlug = (s: string) => SLUG.test(s);
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const videoDir = (slug: string) => {
  if (!isSlug(slug)) throw new Error("bad slug");
  return path.join(VIDEOS_DIR, slug);
};

/** Resolve a file inside a video dir, refusing anything that escapes it. */
export const safeFile = (slug: string, rel: string) => {
  const dir = videoDir(slug);
  const abs = path.resolve(dir, rel);
  if (!abs.startsWith(dir + path.sep) && abs !== dir) throw new Error("path escapes video dir");
  return abs;
};

export type VideoSummary = {
  slug: string;
  title: string;
  series?: string;
  scenes: number;
  hasVo: boolean;
  hasRender: boolean;
  thumb?: string;
  updatedAt: number;
  invalid?: string;
};

const readJson = <T>(p: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
};

export const listVideos = (): VideoSummary[] => {
  if (!fs.existsSync(VIDEOS_DIR)) return [];
  return fs
    .readdirSync(VIDEOS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isSlug(d.name) && fs.existsSync(path.join(VIDEOS_DIR, d.name, "script.json")))
    .map((d) => {
      const dir = path.join(VIDEOS_DIR, d.name);
      const raw = readJson<Record<string, unknown>>(path.join(dir, "script.json"));
      const parsed = raw ? Script.safeParse(raw) : null;
      const stat = fs.statSync(path.join(dir, "script.json"));
      return {
        slug: d.name,
        title: (parsed?.success ? parsed.data.title : (raw?.title as string)) ?? d.name,
        series: parsed?.success ? parsed.data.series : undefined,
        scenes: parsed?.success ? parsed.data.scenes.length : Array.isArray(raw?.scenes) ? (raw!.scenes as unknown[]).length : 0,
        hasVo: fs.existsSync(path.join(dir, "vo", "manifest.json")),
        hasRender: fs.existsSync(path.join(dir, "out", `${d.name}.mp4`)),
        thumb: fs.existsSync(path.join(dir, "out", "thumb.png")) ? `/api/videos/${d.name}/file/out/thumb.png` : undefined,
        updatedAt: stat.mtimeMs,
        invalid: parsed && !parsed.success ? parsed.error.issues[0]?.message : undefined,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const readScriptRaw = (slug: string): unknown => readJson(path.join(videoDir(slug), "script.json"));

export const writeScript = (slug: string, script: ScriptT) => {
  const dir = videoDir(slug);
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "script.json"), JSON.stringify(script, null, 2) + "\n");
};

export const readVo = (slug: string): VoManifestT | null => readJson<VoManifestT>(path.join(videoDir(slug), "vo", "manifest.json"));

export type AssetInfo = { name: string; path: string; size: number; kind: "image" | "video" | "audio" | "other"; url: string };

const kindOf = (name: string): AssetInfo["kind"] => {
  const ext = path.extname(name).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(ext)) return "image";
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".m4a", ".aac", ".ogg"].includes(ext)) return "audio";
  return "other";
};

export const listAssets = (slug: string): AssetInfo[] => {
  const dir = path.join(videoDir(slug), "assets");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith("."))
    .map((d) => {
      const st = fs.statSync(path.join(dir, d.name));
      return { name: d.name, path: `assets/${d.name}`, size: st.size, kind: kindOf(d.name), url: `/api/videos/${slug}/file/assets/${encodeURIComponent(d.name)}` };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const saveAsset = async (slug: string, file: File): Promise<AssetInfo> => {
  const dir = path.join(videoDir(slug), "assets");
  fs.mkdirSync(dir, { recursive: true });
  const clean = file.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+/, "") || `asset-${Date.now()}`;
  const dest = path.join(dir, clean);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return { name: clean, path: `assets/${clean}`, size: buf.length, kind: kindOf(clean), url: `/api/videos/${slug}/file/assets/${encodeURIComponent(clean)}` };
};

export type Outputs = { mp4?: string; thumb?: string; srt?: string; voSheet?: string; stills: { name: string; url: string }[]; renderedAt?: number };

export const listOutputs = (slug: string): Outputs => {
  const out = path.join(videoDir(slug), "out");
  const u = (rel: string) => `/api/videos/${slug}/file/out/${rel}`;
  const has = (rel: string) => fs.existsSync(path.join(out, rel));
  const stillsDir = path.join(out, "stills");
  const stills = fs.existsSync(stillsDir)
    ? fs
        .readdirSync(stillsDir)
        .filter((f) => f.endsWith(".png"))
        .sort()
        .map((f) => ({ name: f, url: `${u("stills/" + f)}?t=${fs.statSync(path.join(stillsDir, f)).mtimeMs}` }))
    : [];
  const mp4 = `${slug}.mp4`;
  return {
    mp4: has(mp4) ? `${u(mp4)}?t=${fs.statSync(path.join(out, mp4)).mtimeMs}` : undefined,
    thumb: has("thumb.png") ? `${u("thumb.png")}?t=${fs.statSync(path.join(out, "thumb.png")).mtimeMs}` : undefined,
    srt: has("captions.srt") ? u("captions.srt") : undefined,
    voSheet: has("vo-sheet.md") ? u("vo-sheet.md") : undefined,
    stills,
    renderedAt: has(mp4) ? fs.statSync(path.join(out, mp4)).mtimeMs : undefined,
  };
};

export const createVideo = (title: string, fromSlug?: string): string => {
  let slug = slugify(title) || `video-${Date.now()}`;
  let n = 2;
  while (fs.existsSync(path.join(VIDEOS_DIR, slug))) slug = `${slugify(title)}-${n++}`;
  const dir = path.join(VIDEOS_DIR, slug);
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  let script: ScriptT;
  if (fromSlug && isSlug(fromSlug) && fs.existsSync(path.join(VIDEOS_DIR, fromSlug, "script.json"))) {
    const src = Script.parse(readJson(path.join(VIDEOS_DIR, fromSlug, "script.json")));
    script = { ...src, id: slug, title };
    // copy assets so the template renders
    const srcAssets = path.join(VIDEOS_DIR, fromSlug, "assets");
    if (fs.existsSync(srcAssets)) for (const f of fs.readdirSync(srcAssets)) fs.copyFileSync(path.join(srcAssets, f), path.join(dir, "assets", f));
  } else {
    script = {
      id: slug,
      title,
      brand: "utd",
      series: "UTD DIARIES",
      voice: { provider: "elevenlabs", voiceId: "onwK4e9ZLuTAKqWW03F9", modelId: "eleven_multilingual_v2", stability: 0.45, similarity: 0.8 },
      music: { src: "placeholder", volume: 0.14, duck: 0.35 },
      captions: { mode: "chunk" },
      scenes: [
        { type: "hook", kicker: "OLD TRAFFORD", word: "HOOK?", sub: "One line that sets up the story.", vo: "Open with the line that makes them stay." },
        { type: "cta", line: "Follow for the full breakdown", vo: "Follow UTD Diaries for the next breakdown." },
      ],
    };
  }
  writeScript(slug, script);
  return slug;
};
