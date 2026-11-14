// pnpm images <slug> [--force] [--only 3,5] [--style plate|sketch|photo]
//
// Generates the pictures a script asks for and writes them into videos/<slug>/assets/:
//   image scenes with `prompt` and no `src`      → assets/gen-<n>-<hash>.png  (portrait 1024×1536)
//   board scenes whose card has `prompt`, no img → assets/card-<n>-<hash>.png (square 1024×1024, ink sketch)
// script.json is updated with the file paths. Needs OPENAI_API_KEY (model via UTD_IMAGE_MODEL, default gpt-image-1).
import fs from "node:fs";
import path from "node:path";
import type { Script } from "../src/schema";
import { hashText, loadScript, log, parseArgs, videoDir } from "./lib";

type Style = "plate" | "sketch" | "photo";

const NO_TEXT = "No text, no letters, no numbers, no logos, no club badges, no watermarks, no captions.";

const STYLE: Record<Style, (subject: string) => string> = {
  plate: (s) =>
    `Cinematic editorial illustration for a football analysis video: ${s}. Dark ink-black background, dramatic stadium floodlight glow, deep red and warm gold accents, painterly texture, moody and premium, vertical poster composition with the subject in the upper two thirds and the lower third darker. ${NO_TEXT}`,
  sketch: (s) =>
    `Editorial ink sketch portrait: ${s}. Loose confident pen and ink crosshatching, high contrast black ink on warm cream paper, a single spot of deep red, head and shoulders, three-quarter view, newspaper illustration style. ${NO_TEXT}`,
  photo: (s) => `Photorealistic editorial sports photograph: ${s}. Natural stadium light, shallow depth of field, 35mm, candid, high detail. ${NO_TEXT}`,
};

const generate = async (prompt: string, size: "1024x1536" | "1024x1024"): Promise<Buffer> => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set — set it in the window that runs the app, then run Images again");
  const model = process.env.UTD_IMAGE_MODEL ?? "gpt-image-1";
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, n: 1, size, quality: process.env.UTD_IMAGE_QUALITY ?? "medium", output_format: "png" }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    throw new Error(`OpenAI images ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { data: { b64_json?: string; url?: string }[] };
  const d = json.data?.[0];
  if (d?.b64_json) return Buffer.from(d.b64_json, "base64");
  if (d?.url) {
    const r = await fetch(d.url);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error("OpenAI images: empty response");
};

/** Try the prompt; if the model refuses (policy), retry once with people de-identified. */
const generateSafe = async (subject: string, style: Style, size: "1024x1536" | "1024x1024"): Promise<{ png: Buffer; note?: string }> => {
  try {
    return { png: await generate(STYLE[style](subject), size) };
  } catch (e) {
    const msg = (e as Error).message;
    if (!/safety|policy|moderation|content_policy|rejected|400/i.test(msg)) throw e;
    const generic = subject.replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, "a football figure");
    log(`image refused for "${subject.slice(0, 60)}" → retrying without names`);
    return { png: await generate(STYLE[style](generic + ", face not identifiable"), size), note: "de-identified" };
  }
};

const main = async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const slug = positional[0];
  if (!slug) throw new Error("usage: pnpm images <slug> [--force] [--only 2,5] [--style plate|sketch|photo]");
  const dir = videoDir(slug);
  const script: Script = loadScript(dir);
  const only = flags.only ? String(flags.only).split(",").map((n) => Number(n) - 1) : null;
  const forceStyle = flags.style ? (String(flags.style) as Style) : null;
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });

  let made = 0, skipped = 0;
  const save = () => fs.writeFileSync(path.join(dir, "script.json"), JSON.stringify(script, null, 2) + "\n");

  for (let i = 0; i < script.scenes.length; i++) {
    const sc = script.scenes[i];
    if (only && !only.includes(i)) continue;

    if (sc.type === "image" && sc.prompt) {
      const style = forceStyle ?? sc.style ?? "plate";
      const file = `assets/gen-${String(i + 1).padStart(2, "0")}-${hashText(style + sc.prompt)}.png`;
      if (!flags.force && sc.src && fs.existsSync(path.join(dir, sc.src))) {
        skipped++;
        continue;
      }
      log(`scene ${i + 1}: ${style} — ${sc.prompt.slice(0, 80)}…`);
      const { png, note } = await generateSafe(sc.prompt, style, "1024x1536");
      fs.writeFileSync(path.join(dir, file), png);
      sc.src = file;
      if (!sc.source) sc.source = `AI illustration${note ? " · " + note : ""}`;
      made++;
      save();
    }

    if (sc.type === "board" && sc.card?.prompt) {
      const file = `assets/card-${String(i + 1).padStart(2, "0")}-${hashText(sc.card.prompt)}.png`;
      if (!flags.force && sc.card.img && fs.existsSync(path.join(dir, sc.card.img))) {
        skipped++;
        continue;
      }
      log(`scene ${i + 1}: card sketch — ${sc.card.prompt.slice(0, 80)}`);
      const { png } = await generateSafe(sc.card.prompt, "sketch", "1024x1024");
      fs.writeFileSync(path.join(dir, file), png);
      sc.card.img = file;
      made++;
      save();
    }
  }
  log(`images: ${made} generated, ${skipped} already there → ${path.join(dir, "assets")}`);
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
