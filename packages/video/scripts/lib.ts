// Shared helpers for the CLI scripts (vo.ts, render.ts, still.ts, studio.ts).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Script, VoManifest, type Script as ScriptT, type VoManifest as VoManifestT } from "../src/schema";

export const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = path.resolve(PKG_DIR, "..", "..");
export const ENTRY = path.join(PKG_DIR, "src", "index.ts");

/** Root folder holding one sub-folder per video. Override with UTD_VIDEOS_DIR (Modal volume). */
export const VIDEOS_DIR = process.env.UTD_VIDEOS_DIR ? path.resolve(process.env.UTD_VIDEOS_DIR) : path.join(REPO_DIR, "videos");

export type Args = { positional: string[]; flags: Record<string, string | boolean> };

export const parseArgs = (argv: string[]): Args => {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { positional, flags };
};

export const videoDir = (slug: string): string => {
  const dir = path.join(VIDEOS_DIR, slug);
  if (!fs.existsSync(path.join(dir, "script.json"))) {
    throw new Error(`No script.json in ${dir}. Create videos/${slug}/script.json first.`);
  }
  return dir;
};

export const loadScript = (dir: string): ScriptT => {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "script.json"), "utf8"));
  const parsed = Script.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`script.json is invalid:\n${issues}`);
  }
  return parsed.data;
};

export const loadVo = (dir: string): VoManifestT | null => {
  const p = path.join(dir, "vo", "manifest.json");
  if (!fs.existsSync(p)) return null;
  return VoManifest.parse(JSON.parse(fs.readFileSync(p, "utf8")));
};

export const saveVo = (dir: string, manifest: VoManifestT) => {
  fs.mkdirSync(path.join(dir, "vo"), { recursive: true });
  fs.writeFileSync(path.join(dir, "vo", "manifest.json"), JSON.stringify(manifest, null, 2));
};

export const hashText = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

export const browserExecutable = (): string | undefined => process.env.UTD_BROWSER ?? process.env.REMOTION_BROWSER_EXECUTABLE ?? undefined;

export const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.round((s % 1) * 10))}`;

export const log = (...a: unknown[]) => console.log("[utd-gen]", ...a);
