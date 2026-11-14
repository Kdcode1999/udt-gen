// Remotion Studio config. The CLI scripts (render.ts / still.ts) pass the same
// options programmatically, so this file only matters for `pnpm studio`.
import { Config } from "@remotion/cli/config";
import path from "node:path";

// `pnpm studio <slug>` sets UTD_VIDEO_DIR to videos/<slug>; the Studio then
// serves that folder as the public dir, so staticFile("assets/x.png") and
// staticFile("vo/scene-01.mp3") resolve exactly as they do in a render.
const videoDir = process.env.UTD_VIDEO_DIR;
if (videoDir) {
  Config.setPublicDir(path.resolve(videoDir));
}

// Optional: point Remotion at an existing Chrome/Chromium instead of letting it
// download Chrome Headless Shell (needed in sandboxes without download access).
const browser = process.env.UTD_BROWSER ?? process.env.REMOTION_BROWSER_EXECUTABLE;
if (browser) {
  Config.setBrowserExecutable(browser);
}

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(90);
Config.setPixelFormat("yuv420p");
Config.setCodec("h264");
Config.setCrf(18);
Config.setOverwriteOutput(true);
