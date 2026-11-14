// pnpm images <slug> [--force] [--replan] [--only 3,5] [--style plate|sketch|photo]
//
// Generates the pictures a script asks for and writes them into videos/<slug>/assets/:
//   image scenes with `prompt` and no `src`      → assets/gen-<n>-<hash>.png  (portrait 1024×1536)
//   board scenes whose card has `prompt`, no img → assets/card-<n>-<hash>.png (square 1024×1024, ink sketch)
// script.json is updated with the file paths. Needs OPENAI_API_KEY (model via UTD_IMAGE_MODEL, default gpt-image-2).
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
  photo: (s) =>
    `Photorealistic press photograph from a football match-day, documentary style: ${s}. One clear subject, one real moment; natural stadium light, shallow depth of field, 35mm, candid, high detail, dark moody colour grade with deep reds. No symbolic props, no collage, no montage, no split frames. ${NO_TEXT}`,
};

/** Likeness line for a named real person: the picture is about THEM, not a generic figure. */
const identity = (person: string | undefined, brief: string | null) =>
  person ? `The person is ${person} — an accurate, recognisable likeness of the real ${person}${brief ? ` (${brief})` : ""}, not a generic lookalike. ` : "";

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

const appearanceBrief = async (subject: string, dir: string, person?: string): Promise<string | null> => {
  const who = person ?? subject.match(NAME_RE)?.[1] ?? subject.match(TEAM_RE)?.[1];
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

const withCurrency = async (subject: string, dir: string, person?: string): Promise<string> => {
  const brief = await appearanceBrief(subject, dir, person);
  if (person) return `${identity(person, brief)}${subject}`;
  return brief ? `${subject}. Current appearance (${new Date().toISOString().slice(0, 7)}): ${brief}` : subject;
};

/** Who or what is this video about? For the hook background. */
const inferHookSubject = async (script: Script, research: string): Promise<{ prompt: string; person?: string } | null> =>
  claudeText(
    'Reply with JSON only: {"prompt": string, "person": string|null}. prompt = one or two sentences briefing a press photographer for the opening background picture of a football video: the single main subject (the named person the story is about, or the team as a group if it is about the team), the setting, the mood; a real moment, no symbolism, no text or logos. person = that person\'s full name, or null when it is the team.',
    `Title: ${script.title}\nVoice-over:\n${script.scenes.map((s, i) => `${i + 1}. ${"vo" in s && s.vo ? s.vo : ""}`).join("\n")}\n${research ? `Research notes:\n${research.slice(0, 2000)}` : ""}`,
    false,
    300,
  ).then((t) => {
    const m = t?.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const o = JSON.parse(m[0]) as { prompt?: string; person?: string | null };
      return o.prompt ? { prompt: o.prompt, person: o.person ?? undefined } : null;
    } catch {
      return null;
    }
  });

/** One planning pass for the whole video: varied, photo-real moment pictures, cue words copied from the voice-over. */
type Planned = { cue: string; prompt: string; style?: Style; person?: string };
const planVisuals = async (script: Script, research: string, targets: number[]): Promise<Record<number, Planned[]>> => {
  if (!targets.length) return {};
  const already = script.scenes
    .map((sc, i) => (sc.type === "hook" ? `hook background: ${sc.bgPrompt ?? ""}` : sc.type === "image" ? `scene ${i + 1} image: ${sc.prompt ?? sc.caption ?? ""}` : ""))
    .filter(Boolean)
    .join("\n");
  const text = await claudeText(
    `You are the picture editor of a Manchester United short-video page. For each listed scene choose 1–3 background pictures that fire while the voice-over is spoken. Reply with JSON only:
{"scenes": {"<sceneNumber>": [{"cue": string, "prompt": string, "style": "photo"|"plate", "person": string|null}]}}
Rules:
- cue: ONE word copied exactly from that scene's voice-over (an opponent, a player, a place, a moment). The first visual of a scene uses the first word of the voice-over so the scene never starts bare.
- prompt: a specific real MOMENT as a press photograph — who, where, what is happening, emotion. E.g. cue "Villa" → "Aston Villa players piling on the scorer in front of the away end at Old Trafford while two Manchester United defenders stand with hands on hips". Not a portrait, not symbolism (no clocks, hourglasses, chess, storms), no montages.
- VARIETY across the whole video: no two pictures with the same concept; mix close faces, wide stadium shots, action, dugout, tunnel, fans, dressing room, training ground. Do not repeat the pictures already planned (listed below). The same person's face at most twice in the whole video.
- style: "photo" for anything with people or places; "plate" only for abstract beats.
- person: the real person who must be recognisable in the picture (full name), or null. If the scene is about a person (a quote by them, their stats), one of its visuals should show THEM, clearly identified in "person".
- Only facts consistent with the research notes; never invent trophies, injuries or kits.`,
    `Video: ${script.title}${script.series ? ` (${script.series})` : ""}
Already planned pictures:
${already || "(none)"}

Scenes needing visuals:
${targets.map((i) => `scene ${i + 1} (${script.scenes[i].type}) voice-over: ${"vo" in script.scenes[i] ? script.scenes[i].vo : ""}`).join("\n")}

${research ? `Research notes:\n${research.slice(0, 3000)}` : ""}`,
    false,
    2500,
  );
  const m = text?.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    const out = JSON.parse(m[0]) as { scenes?: Record<string, { cue?: string; prompt?: string; style?: string; person?: string | null }[]> };
    const res: Record<number, Planned[]> = {};
    for (const [k, list] of Object.entries(out.scenes ?? {})) {
      const idx = Number(k) - 1;
      if (!targets.includes(idx) || !Array.isArray(list)) continue;
      res[idx] = list
        .filter((v) => v.cue && v.prompt)
        .slice(0, 3)
        .map((v) => ({ cue: v.cue!, prompt: v.prompt!, style: v.style === "plate" ? "plate" : "photo", person: v.person ?? undefined }));
    }
    return res;
  } catch {
    return {};
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

  // --replan: throw away what the system chose before (keeps anything a human typed) and plan again
  if (flags.replan) {
    for (const sc of script.scenes) {
      if (sc.visuals) sc.visuals = sc.visuals.filter((v) => !v.auto);
      if (sc.type === "hook" && sc.bgAuto) {
        delete sc.bgPrompt;
        delete sc.bg;
        delete sc.bgPerson;
      }
    }
    save();
  }
  // plan voice-synced visuals for every eligible scene that has none — one pass, so the pictures vary
  const needPlan = script.scenes
    .map((sc, i) => ((sc.type === "stat" || sc.type === "quote" || sc.type === "compare" || sc.type === "cta") && !sc.visuals?.length && sc.vo && (!only || only.includes(i)) ? i : -1))
    .filter((i) => i >= 0);
  if (needPlan.length) {
    log(`planning pictures for ${needPlan.length} scene(s)…`);
    const plan = await planVisuals(script, research, needPlan);
    for (const [k, list] of Object.entries(plan)) {
      if (list.length) script.scenes[Number(k)].visuals = list.map((v) => ({ ...v, auto: true }));
    }
    save();
  }

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
        const file = `assets/vis-${String(i + 1).padStart(2, "0")}-${v + 1}-${hashText(style + subject + (vis.person ?? ""))}.png`;
        log(`scene ${i + 1} visual ${v + 1} (${vis.cue ?? vis.at ?? "start"}): ${subject.slice(0, 70)}…`);
        const { png } = await generateSafe(await withCurrency(subject, dir, vis.person), style, "1024x1536");
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
        const inferred = await inferHookSubject(script, research);
        sc.bgPrompt = inferred?.prompt ?? `${script.title}, the main subject of the story`;
        sc.bgPerson = inferred?.person;
        sc.bgAuto = true;
        save();
      }
      const subject = await withCurrency(sc.bgPrompt, dir, sc.bgPerson);
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
      const style = forceStyle ?? sc.style ?? (sc.person ? "photo" : "plate");
      const file = `assets/gen-${String(i + 1).padStart(2, "0")}-${hashText(style + subject + (sc.person ?? ""))}.png`;
      log(`scene ${i + 1}: ${style} — ${subject.slice(0, 80)}…`);
      const { png, note } = await generateSafe(await withCurrency(subject, dir, sc.person), style, "1024x1536");
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
      const { png } = await generateSafe(await withCurrency(subject, dir, sc.card.name.split(/\s+/).length >= 2 ? sc.card.name : undefined), "sketch", "1024x1024");
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
