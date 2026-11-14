// pnpm still <slug> [--all] [--scene N] [--at 0.6] [--out <dir>]
//
// Approval-gate previews: one PNG per scene (default 60% into the scene) in
// out/stills/, plus a contact sheet-friendly file list. No video is encoded.
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { buildTimeline } from "../src/timing";
import { FPS } from "../src/brand";
import { browserExecutable, ENTRY, loadScript, loadVo, log, parseArgs, videoDir } from "./lib";

const main = async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const slug = positional[0];
  if (!slug) throw new Error("usage: pnpm still <slug> [--all] [--scene N] [--at 0.6]");
  const dir = videoDir(slug);
  const script = loadScript(dir);
  const vo = loadVo(dir);
  const timeline = buildTimeline(script, vo, FPS);
  const outDir = flags.out ? path.resolve(String(flags.out)) : path.join(dir, "out", "stills");
  fs.mkdirSync(outDir, { recursive: true });
  const at = flags.at ? Number(flags.at) : 0.6;

  const serveUrl = await bundle({ entryPoint: ENTRY, publicDir: dir, onProgress: () => {} });
  const inputProps = { slug, script, vo, timeline: null };
  const composition = await selectComposition({ serveUrl, id: "UTDVideo", inputProps, browserExecutable: browserExecutable() });

  const targets = flags.scene ? [timeline.scenes[Number(flags.scene) - 1]] : timeline.scenes;
  for (const s of targets) {
    const frame = s.start + Math.min(s.duration - 1, Math.round(s.duration * at));
    const out = path.join(outDir, `${String(s.index + 1).padStart(2, "0")}-${s.type}.png`);
    await renderStill({ serveUrl, composition, inputProps, frame, output: out, imageFormat: "png", browserExecutable: browserExecutable(), chromiumOptions: { gl: "angle" }, overwrite: true });
    log(`still ${path.basename(out)} (frame ${frame})`);
  }
  log(`stills in ${outDir}`);
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
