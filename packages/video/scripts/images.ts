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

type Size = "1024x1536" | "1024x1024";

const errorText = async (res: Response) => {
  const raw = (await res.text()).replace(/\s+/g, " ").trim();
  try {
    const j = JSON.parse(raw) as { error?: { message?: string; code?: string } };
    return j.error?.message ?? raw.slice(0, 400);
  } catch {
    return raw.slice(0, 400);
  }
};

const callImages = async (model: string, prompt: string, size: Size): Promise<Buffer> => {
  const key = process.env.OPENAI_API_KEY!;
  const dalle = model.startsWith("dall-e");
  const body = dalle
    ? { model, prompt, n: 1, size: size === "1024x1536" ? "1024x1792" : "1024x1024", quality: "standard", response_format: "b64_json" }
    : { model, prompt, n: 1, size, quality: process.env.UTD_IMAGE_QUALITY ?? "medium", output_format: "png" };
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI images ${res.status} (${model}): ${await errorText(res)}`);
  const json = (await res.json()) as { data: { b64_json?: string; url?: string }[] };
  const d = json.data?.[0];
  if (d?.b64_json) return Buffer.from(d.b64_json, "base64");
  if (d?.url) {
    const r = await fetch(d.url);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error("OpenAI images: empty response");
};

/** gpt-image-1 first (needs a verified OpenAI org); fall back to dall-e-3 when the account can't use it. */
const generate = async (prompt: string, size: Size): Promise<Buffer> => {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set — set it in the window that runs the app, then run Images again");
  const preferred = process.env.UTD_IMAGE_MODEL ?? "gpt-image-1";
  try {
    return await callImages(preferred, prompt, size);
  } catch (e) {
    const msg = (e as Error).message;
    const modelProblem = /verif|model_not_found|does not exist|not have access|invalid model|unsupported|Unknown parameter|output_format|must be verified/i.test(msg);
    if (preferred.startsWith("dall-e") || !modelProblem) throw e;
    log(`${preferred} unavailable on this account (${msg.slice(0, 120)}) → using dall-e-3`);
    return callImages("dall-e-3", prompt, size);
  }
};

/** Try the prompt; if the model refuses (policy), retry once with people de-identified. */
const generateSafe = async (subject: string, style: Style, size: Size): Promise<{ png: Buffer; note?: string }> => {
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

/** Work out what the picture should be from the scene's context — no human input needed. */
const inferImageSpec = async (script: Script, i: number, research: string): Promise<{ prompt: string; caption?: string; style?: Style } | null> => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const sc = script.scenes[i];
  if (sc.type !== "image") return null;
  const ctx = (j: number) => {
    const x = script.scenes[j];
    return x ? `scene ${j + 1} (${x.type}): ${"vo" in x && x.vo ? x.vo : ""}` : "";
  };
  const instructionLike = /drop in|licensed|footage|photo of|placeholder|insert/i.test(sc.caption ?? "");
  const body = {
    model: process.env.UTD_DRAFT_MODEL ?? "claude-sonnet-5-5",
    max_tokens: 400,
    system:
      "You brief an illustrator for a Manchester United short-video page. Reply with JSON only: {\"prompt\": string, \"caption\": string, \"style\": \"plate\"|\"sketch\"|\"photo\"}. " +
      "prompt = one or two sentences describing a single strong picture for this scene: specific subject (named people are fine), setting, moment, mood; no text or logos in the picture. " +
      "style: sketch for a portrait of one person, photo for a realistic scene, plate for an atmospheric/cinematic composition. " +
      "caption = 3–6 word UPPERCASE on-screen headline for the scene (keep the existing caption if it already is a good headline).",
    messages: [
      {
        role: "user",
        content: `Video: ${script.title}${script.series ? ` (${script.series})` : ""}
Image scene ${i + 1} voice-over: ${sc.vo ?? "(none)"}
Existing caption: ${sc.caption ?? "(none)"}${instructionLike ? "  ← this is an instruction, not a headline; write a real one" : ""}
Before: ${ctx(i - 1)}
After: ${ctx(i + 1)}
${research ? `Research notes (facts to stay consistent with):\n${research.slice(0, 2500)}` : ""}`,
      },
    ],
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    log(`image brief: Claude ${res.status} — falling back to caption`);
    return null;
  }
  const json = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = json.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const out = JSON.parse(m[0]) as { prompt?: string; caption?: string; style?: string };
    if (!out.prompt) return null;
    const style = (["plate", "sketch", "photo"] as Style[]).includes(out.style as Style) ? (out.style as Style) : undefined;
    return { prompt: out.prompt, caption: out.caption, style };
  } catch {
    return null;
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
  const researchPath = path.join(dir, "research.md");
  const research = fs.existsSync(researchPath) ? fs.readFileSync(researchPath, "utf8") : "";

  for (let i = 0; i < script.scenes.length; i++) {
    const sc = script.scenes[i];
    if (only && !only.includes(i)) continue;

    if (sc.type === "image") {
      if (!flags.force && sc.src && fs.existsSync(path.join(dir, sc.src))) {
        skipped++;
        continue;
      }
      if (!sc.prompt) {
        // no prompt: let the system work out the picture from the scene's context
        log(`scene ${i + 1}: writing the picture brief from context…`);
        const spec = await inferImageSpec(script, i, research);
        if (spec) {
          sc.prompt = spec.prompt;
          if (spec.style && !sc.style) sc.style = spec.style;
          if (spec.caption && (!sc.caption || /drop in|licensed|footage|photo of|placeholder|insert/i.test(sc.caption))) sc.caption = spec.caption.toUpperCase();
          save();
        }
      }
      const subject = (sc.prompt ?? sc.caption ?? "").replace(/^\s*drop in:?\s*/i, "").replace(/\bno broadcast footage\.?/i, "").trim();
      if (!subject) {
        log(`scene ${i + 1}: image has no prompt, caption or voice line — skipped`);
        continue;
      }
      const style = forceStyle ?? sc.style ?? "plate";
      const file = `assets/gen-${String(i + 1).padStart(2, "0")}-${hashText(style + subject)}.png`;
      log(`scene ${i + 1}: ${style} — ${subject.slice(0, 80)}…`);
      const { png, note } = await generateSafe(subject, style, "1024x1536");
      fs.writeFileSync(path.join(dir, file), png);
      sc.src = file;
      if (!sc.source) sc.source = `AI illustration${note ? " · " + note : ""}`;
      made++;
      save();
    }

    if (sc.type === "board" && sc.card) {
      const subject = sc.card.prompt ?? `${sc.card.name}${sc.card.sub ? ", " + sc.card.sub : ""}, footballer portrait`;
      const file = `assets/card-${String(i + 1).padStart(2, "0")}-${hashText(subject)}.png`;
      if (!flags.force && sc.card.img && fs.existsSync(path.join(dir, sc.card.img))) {
        skipped++;
        continue;
      }
      log(`scene ${i + 1}: card sketch — ${subject.slice(0, 80)}`);
      const { png } = await generateSafe(subject, "sketch", "1024x1024");
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
