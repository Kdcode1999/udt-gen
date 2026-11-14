// pnpm post <slug>  → out/post.txt + out/post.json (caption, detailed description, short caption, hashtags, sources)
import { loadScript, loadVo, parseArgs, videoDir } from "./lib";
import { buildTimeline } from "../src/timing";
import { FPS } from "../src/brand";
import { generatePost } from "./postcopy";

const main = async () => {
  const { positional } = parseArgs(process.argv.slice(2));
  const slug = positional[0];
  if (!slug) throw new Error("usage: pnpm post <slug>");
  const dir = videoDir(slug);
  const script = loadScript(dir);
  const timeline = buildTimeline(script, loadVo(dir), FPS);
  await generatePost(dir, script, timeline.total / FPS);
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
