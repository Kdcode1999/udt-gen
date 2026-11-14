// pnpm render <slug> [--scenes] [--no-thumb] [--concurrency N] [--out <dir>] [--only 3,5]
//
// Bundles the Remotion project once, then renders:
//   out/<slug>.mp4        full cut, voice + SFX + music, burned captions, h264 + AAC
//   out/scenes/NN-type.mp4  per-scene silent cuts (only with --scenes)
//   out/captions.srt      word-timed subtitles
//   out/vo-sheet.md       scene / timecode / VO line table
//   out/thumb.png         hook frame
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { buildTimeline, chunkWords, toSrtTime } from "../src/timing";
import { FPS } from "../src/brand";
import { browserExecutable, ENTRY, fmtSec, loadScript, loadVo, log, parseArgs, videoDir } from "./lib";

const main = async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const slug = positional[0];
  if (!slug) throw new Error("usage: pnpm render <slug> [--scenes] [--no-thumb] [--concurrency N]");

  const dir = videoDir(slug);
  const script = loadScript(dir);
  const vo = loadVo(dir);
  const outDir = flags.out ? path.resolve(String(flags.out)) : path.join(dir, "out");
  fs.mkdirSync(outDir, { recursive: true });

  const timeline = buildTimeline(script, vo, FPS);
  const missingVo = timeline.scenes.filter((s) => script.scenes[s.index].vo && !s.audio).length;
  if (missingVo) log(`warning: ${missingVo} scene(s) have VO text but no audio yet — run \`pnpm vo ${slug}\` for voice. Rendering with estimated timing.`);

  log(`bundling…`);
  const serveUrl = await bundle({
    entryPoint: ENTRY,
    publicDir: dir,
    onProgress: () => {},
  });

  const inputProps = { slug, script, vo, timeline: null };
  const composition = await selectComposition({ serveUrl, id: "UTDVideo", inputProps, browserExecutable: browserExecutable() });
  log(`composition: ${composition.width}×${composition.height} @${composition.fps}fps, ${composition.durationInFrames} frames (${fmtSec(composition.durationInFrames / composition.fps)})`);

  const concurrency = flags.concurrency ? Number(flags.concurrency) : undefined;
  const common = {
    composition,
    serveUrl,
    inputProps,
    codec: "h264" as const,
    audioCodec: "aac" as const,
    crf: 18,
    pixelFormat: "yuv420p" as const,
    imageFormat: "jpeg" as const,
    jpegQuality: 90,
    browserExecutable: browserExecutable(),
    concurrency,
    chromiumOptions: { gl: "angle" as const },
    overwrite: true,
  };

  const finalPath = path.join(outDir, `${slug}.mp4`);
  const tmpPath = path.join(outDir, `${slug}.rendering.mp4`);
  let lastPct = -1;
  const t0 = Date.now();
  await renderMedia({
    ...common,
    outputLocation: tmpPath,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        log(`render ${pct}%`);
      }
    },
  });
  fs.renameSync(tmpPath, finalPath);
  log(`full cut → ${finalPath} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  // per-scene silent cuts
  const only = flags.only ? String(flags.only).split(",").map((n) => Number(n) - 1) : null;
  if (flags.scenes) {
    const sceneDir = path.join(outDir, "scenes");
    fs.mkdirSync(sceneDir, { recursive: true });
    for (const s of timeline.scenes) {
      if (only && !only.includes(s.index)) continue;
      const name = `${String(s.index + 1).padStart(2, "0")}-${s.type}.mp4`;
      const tmp = path.join(sceneDir, name.replace(".mp4", ".rendering.mp4"));
      await renderMedia({ ...common, muted: true, frameRange: [s.start, s.start + s.duration - 1], outputLocation: tmp });
      fs.renameSync(tmp, path.join(sceneDir, name));
      log(`scene ${name}`);
    }
  }

  // captions.srt
  const srt: string[] = [];
  let n = 1;
  for (const s of timeline.scenes) {
    for (const c of chunkWords(s.words, script.captions?.mode === "word" ? "word" : "chunk")) {
      srt.push(`${n++}\n${toSrtTime(s.start + c.start, FPS)} --> ${toSrtTime(s.start + c.end, FPS)}\n${c.words.map((w) => w.text).join(" ")}\n`);
    }
  }
  fs.writeFileSync(path.join(outDir, "captions.srt"), srt.join("\n"));

  // vo-sheet.md
  const rows = timeline.scenes.map((s) => {
    const sc = script.scenes[s.index];
    const title = sc.type === "hook" ? sc.word : sc.type === "board" ? sc.title ?? "" : sc.type === "stat" ? sc.label : sc.type === "cta" ? "CTA" : sc.type;
    return `| ${s.index + 1} | ${sc.type} | ${fmtSec(s.start / FPS)} | ${fmtSec(s.duration / FPS)} | ${title.replace(/\|/g, "/")} | ${(sc.vo ?? "").replace(/\|/g, "/")} |`;
  });
  fs.writeFileSync(
    path.join(outDir, "vo-sheet.md"),
    `# ${script.title}\n\nTotal ${fmtSec(timeline.total / FPS)} · ${timeline.scenes.length} scenes · voice: ${vo?.provider ?? "none (estimated timing)"}\n\n| # | type | start | length | on screen | voice-over |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n`,
  );

  // thumbnail: hook scene two-thirds in, else frame 20
  if (!flags["no-thumb"]) {
    const hook = timeline.scenes.find((s) => s.type === "hook") ?? timeline.scenes[0];
    const { jpegQuality: _q, imageFormat: _f, codec: _c, audioCodec: _a, crf: _crf, pixelFormat: _p, concurrency: _n, ...stillOpts } = common;
    // thumbnail without burned captions so it works as a poster
    const thumbProps = { ...inputProps, script: { ...script, captions: { ...(script.captions ?? {}), mode: "off" as const } } };
    await renderStill({ ...stillOpts, inputProps: thumbProps, frame: hook.start + Math.round(hook.duration * 0.66), output: path.join(outDir, "thumb.png"), imageFormat: "png" });
    log(`thumb → ${path.join(outDir, "thumb.png")}`);
  }

  log(`done. outputs in ${outDir}`);
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
