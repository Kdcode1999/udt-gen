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
  photo: (s) => `Photorealistic editorial sports photograph: ${s}. Natural stadium light, shallow depth of field, 35mm, candid, high detail, dark moody grading with deep reds. ${NO_TEXT}`,
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
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, n: 1, size, quality: process.env.UTD_IMAGE_QUALITY ?? "medium", output_format: "png" }),
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

// Current GPT image models (gpt-image-1 and DALL·E were retired in 2026). First one the account can use wins.
const MODEL_CHAIN = [process.env.UTD_IMAGE_MODEL, "gpt-image-2", "gpt-image-1.5", "gpt-image-1-mini"].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);

const generate = async (prompt: string, size: Size): Promise<Buffer> => {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set — set it in the window that runs the app, then run Images again");
  let lastErr: Error | null = null;
  for (const model of MODEL_CHAIN) {
    try {
      return await callImages(model, prompt, size);
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message;
      const modelProblem = /verif|model_not_found|does not exist|not have access|invalid model|unsupported model|must be verified|deprecated|retired/i.test(msg);
      if (!modelProblem) throw e;
      log(`${model} unavailable on this account → trying the next model`);
    }
  }
  throw lastErr ?? new Error("no image model available");
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

// ---- currency: what does the subject look like right now? -------------------
// Live web check (Claude + web_search) → one-sentence appearance brief, cached in assets/appearance.json.
// This is how pictures stay current without copying anyone's photo.
type AppearanceCache = Record<string, { brief: string; at: string }>;

const claudeText = async (system: string, user: string, tools: boolean, maxTokens = 500): Promise<string | null> => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  let messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: user }];
  for (let i = 0; i < 4; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.UTD_DRAFT_MODEL ?? "claude-sonnet-5-5",
        max_tokens: maxTokens,
        system,
        messages,
        ...(tools ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] } : {}),
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content: { type: string; text?: string }[]; stop_reason: string };
    if (json.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: json.content }];
      continue;
    }
    return json.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim() || null;
  }
  return null;
};

const NAME_RE = /\b([A-Z][\p{L}'’-]+(?:\s+(?:de|da|van|von|di|le|el|al)\s+)?(?:\s+[A-Z][\p{L}'’-]+){1,2})\b/u;
const TEAM_RE = /\b(Manchester United|Man United|Man Utd|United|Liverpool|Arsenal|Chelsea|Manchester City|Man City|Tottenham|Spurs|Aston Villa|Newcastle|Everton|Real Madrid|Barcelona|Bayern|PSG|Juventus|Inter|AC Milan)\b/;

const appearanceBrief = async (subject: string, dir: string): Promise<string | null> => {
  const who = subject.match(NAME_RE)?.[1] ?? subject.match(TEAM_RE)?.[1];
  if (!who) return null;
  const cachePath = path.join(dir, "assets", "appearance.json");
  const cache: AppearanceCache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
  const hit = cache[who.toLowerCase()];
  if (hit && Date.now() - Date.parse(hit.at) < 7 * 86400e3) return hit.brief;
  log(`checking what ${who} looks like right now…`);
  const brief = await claudeText(
    "You brief an illustrator so the picture is CURRENT. Use web_search (recent news, this month) and answer in ONE sentence, no preamble: for a person — current club/role, current kit colours (describe, no sponsor or badge names), shirt number if known, hair, facial hair, build, approximate age, a typical current setting; for a team — current kit, current manager, home stadium. Only visual facts you can verify as current; if unsure of a detail, leave it out.",
    `Subject: ${who}. Today: ${new Date().toISOString().slice(0, 10)}.`,
    true,
  );
  if (!brief) return null;
  cache[who.toLowerCase()] = { brief, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  return brief;
};

const withCurrency = async (subject: string, dir: string): Promise<string> => {
  const brief = await appearanceBrief(subject, dir);
  return brief ? `${subject}. Current appearance (${new Date().toISOString().slice(0, 7)}): ${brief}` : subject;
};

/** Who or what is this video about? For the hook background. */
const inferHookSubject = async (script: Script, research: string): Promise<string | null> =>
  claudeText(
    'Reply with JSON only: {"prompt": string}. prompt = one or two sentences briefing an illustrator for the opening background picture of a football video: the single main subject (a named person, or the team as a group if the story is about the team), the setting, the mood. No text or logos in the picture.',
    `Title: ${script.title}\nVoice-over:\n${script.scenes.map((s, i) => `${i + 1}. ${"vo" in s && s.vo ? s.vo : ""}`).join("\n")}\n${research ? `Research notes:\n${research.slice(0, 2000)}` : ""}`,
    false,
    300,
  ).then((t) => {
    const m = t?.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return (JSON.parse(m[0]) as { prompt?: string }).prompt ?? null;
    } catch {
      return null;
    }
  });

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

    // voice-synced visuals (stat / quote / compare / cta)
    if (sc.visuals?.length) {
      for (let v = 0; v < sc.visuals.length; v++) {
        const vis = sc.visuals[v];
        if (!flags.force && vis.src && fs.existsSync(path.join(dir, vis.src))) {
          skipped++;
          continue;
        }
        const subject = vis.prompt ?? vis.cue;
        if (!subject) continue;
        const style = forceStyle ?? vis.style ?? "photo";
        const file = `assets/vis-${String(i + 1).padStart(2, "0")}-${v + 1}-${hashText(style + subject)}.png`;
        log(`scene ${i + 1} visual ${v + 1} (${vis.cue ?? vis.at ?? "start"}): ${subject.slice(0, 70)}…`);
        const { png } = await generateSafe(await withCurrency(subject, dir), style, "1024x1536");
        fs.writeFileSync(path.join(dir, file), png);
        vis.src = file;
        made++;
        save();
      }
    }

    if (sc.type === "hook") {
      if (!flags.force && sc.bg && fs.existsSync(path.join(dir, sc.bg))) {
        skipped++;
        continue;
      }
      if (!sc.bgPrompt) {
        log(`scene ${i + 1}: working out the opening picture from the story…`);
        sc.bgPrompt = (await inferHookSubject(script, research)) ?? `${script.title}, the main subject of the story`;
        save();
      }
      const subject = await withCurrency(sc.bgPrompt, dir);
      const file = `assets/hook-${hashText(subject)}.png`;
      log(`scene ${i + 1}: hook background — ${sc.bgPrompt.slice(0, 80)}…`);
      const { png } = await generateSafe(subject, forceStyle ?? "photo", "1024x1536");
      fs.writeFileSync(path.join(dir, file), png);
      sc.bg = file;
      made++;
      save();
      continue;
    }

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
      const { png, note } = await generateSafe(await withCurrency(subject, dir), style, "1024x1536");
      fs.writeFileSync(path.join(dir, file), png);
      sc.src = file;
      if (!sc.source) sc.source = `AI illustration${note ? " · " + note : ""}`;
      made++;
      save();
    }

    if (sc.type === "board" && sc.card) {
      if (!sc.card.prompt && /illustrative|pattern|tracking|note|disclaimer|example/i.test(`${sc.card.name} ${sc.card.sub ?? ""}`)) {
        log(`scene ${i + 1}: card "${sc.card.name}" is a note, not a player — removed`);
        delete sc.card;
        save();
        continue;
      }
      const subject = sc.card.prompt ?? `${sc.card.name}${sc.card.sub ? ", " + sc.card.sub : ""}, footballer portrait`;
      const file = `assets/card-${String(i + 1).padStart(2, "0")}-${hashText(subject)}.png`;
      if (!flags.force && sc.card.img && fs.existsSync(path.join(dir, sc.card.img))) {
        skipped++;
        continue;
      }
      log(`scene ${i + 1}: card sketch — ${subject.slice(0, 80)}`);
      const { png } = await generateSafe(await withCurrency(subject, dir), "sketch", "1024x1024");
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
