// pnpm studio <slug>  → opens Remotion Studio with videos/<slug> as the public dir.
// Live preview with scrubbing; edit script.json and refresh.
import { spawn } from "node:child_process";
import { ENTRY, PKG_DIR, parseArgs, videoDir } from "./lib";

const { positional } = parseArgs(process.argv.slice(2));
const slug = positional[0] ?? "demo";
const dir = videoDir(slug);

const child = spawn("pnpm", ["exec", "remotion", "studio", ENTRY], {
  cwd: PKG_DIR,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, UTD_VIDEO_DIR: dir },
});
child.on("exit", (code) => process.exit(code ?? 0));
