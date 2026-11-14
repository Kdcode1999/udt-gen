// AI drafting: brief → researched script.json + research.md, via the Claude API with live web search.
// Needs ANTHROPIC_API_KEY in the environment. Model via UTD_DRAFT_MODEL (default claude-sonnet-5-5).
import fs from "node:fs";
import path from "node:path";
import { Script, type Script as ScriptT } from "@utd/video/schema";
import { videoDir } from "./store";

export const draftConfigured = () => !!process.env.ANTHROPIC_API_KEY;
export const draftModel = () => process.env.UTD_DRAFT_MODEL ?? "claude-sonnet-5-5";

const API = "https://api.anthropic.com/v1/messages";

const SCHEMA_DOC = `
Script = {
  id: string, title: string, brand: "utd", series: string (page tag, e.g. "MATCH DIARY", "TRANSFER WATCH", "TACTICS"),
  voice: { provider: "elevenlabs", voiceId: "onwK4e9ZLuTAKqWW03F9", modelId: "eleven_multilingual_v2", stability: 0.45, similarity: 0.8 },
  music: { src: "placeholder", volume: 0.14, duck: 0.35 },
  captions: { mode: "chunk" },
  scenes: Scene[]   // 6–10 scenes, first is hook, last is cta
}
Common optional fields on every scene: vo (string, the spoken line), hold (seconds), sfx ("whoosh"|"hit"|"tick"|"riser"|"none"),
visuals?: [{ cue: string (ONE word copied from this scene's vo, e.g. "Villa"), prompt: string (a real MOMENT as a press photo: who, where, what is happening, emotion — no portraits-by-default, no symbolism), style: "photo" (default; "plate" only for abstract beats), person: string|null (full name of the real person who must be recognisable, else null) }] — for stat, quote, compare and cta scenes: pictures that fade in behind the card the moment the cue word is spoken. Vary them across the video (faces, wide stadium, action, dugout, tunnel, fans); the same face at most twice per video.
Scene types:
 { type:"hook", word: string (ONE word, max two, uppercase, curiosity not description, may end with ?), kicker?: string (place · date), sub?: string (one sentence), bgPrompt: string (the opening background picture as a press photo: the main subject of the video — the named person, or the team as a group if it is about the team — setting, moment, mood), bgPerson: string|null (that person's full name), vo }
 { type:"stat", value: number, label: string (UPPERCASE, e.g. "TACKLES · 24/25"), prefix?: "£", suffix?: "%", decimals?: 0|1, context?: string (one sentence above the card), gold?: boolean (ONLY the single headline stat), source: string, vo }
 { type:"quote", text: string (verbatim), who: string, source: string ("Outlet · d Mon yyyy"), vo }
 { type:"compare", title?: string (UPPERCASE), left:{name, sub?}, right:{name, sub?}, rows: [{label, left:number, right:number, lowerIsBetter?: boolean}] (2–5 rows), source: string, vo }
 { type:"board", title?: string (UPPERCASE, *asterisks* for a gold word), card?: {name, sub?}, ball?: {x,y},
   players: [{id, team:"home"|"away", x:0-100, y:0-100, name?: SURNAME}] (home = Manchester United, defends the bottom goal y≈92; away attacks downward from y≈6; ids like h_gk,h_lb,h_lcb,h_rcb,h_rb,h_dm1,h_dm2,h_lw,h_am,h_rw,h_st and a_gk,a_lb,... ; 11 each; only name 3–5 key players),
   steps: [ { at?: seconds into scene (sync with the vo wording), label?: string, players?: {[id]:{x,y}} (moves), ball?: {x,y}, lines?: [{from:id,to:id}], arrows?: [{from: id|{x,y}, to: id|{x,y}, style:"pass"|"run"|"key"|"press", curve?: -1..1}], highlight?: id[], zone?: {x,y,rx,ry,label?}, zoom?: {x,y,scale:1-1.6} } ] (2–4 steps; step 1 usually just shape lines; the "key" arrow in the last step),
   vo }
 { type:"image", src: "", prompt: string (what to paint: subject, setting, moment, mood — 1–2 sentences, no text in the picture), person: string|null (full name if a real person must be recognisable), style?: "photo" (people/places) | "plate" (abstract) | "sketch", caption: string (3–6 words, UPPERCASE), vo }   // the system generates the picture from prompt
 { type:"footage", src: "", from?: 0, to?: 6, label?: string, caption: string, vo }        // only if the editor has a clip; never broadcast footage
 { type:"cta", line?: string, vo }
Coordinates: x 0 = left touchline, 100 = right; y 0 = top goal line, 100 = bottom goal line. Keep players within y 8–88.
`;

const SYSTEM = `You write scripts for "UTD Diaries", a Manchester United short-video page (Facebook Reels, TikTok, Shorts). You output a JSON script for a 1080×1920 video generator, plus research notes. The scripts are voiced by a British broadcaster voice and captioned word by word.

NON-NEGOTIABLE RULES
1. Verify everything live with web_search before you state it: results, scorers, minutes, transfers, fees, stats, quotes, the current manager, who is in the squad. Assume your memory is out of date; it often is.
2. Every claim in the research notes carries a status: CONFIRMED (official source or several reliable outlets), AGREED (deal agreed, not announced), RUMOUR (single outlet / speculation), TARGET (interest only). Only CONFIRMED facts go on screen in stat, compare and quote scenes. Quotes are verbatim, with outlet and date.
3. If the brief contains a factual error or an outdated assumption, flag it in the research notes with the correct version and source, and write the script on the correct facts.
4. The script must sound human: conviction, reasoning, short sentences, a point of view. No robotic readouts, no "in this video". Pace ≈ 2.4 words per second: total voice-over words ≈ target_seconds × 2.3. Each scene's vo is 1–3 sentences.
5. Hook word: ONE word (two at most), uppercase, that creates curiosity rather than describes ("HIJACK?" not "BARGAIN"). Kicker = place · date when it is a match story.
6. At most one gold stat card, for the single headline number.
7. Mix the scene types for rhythm: boards for tactics, stat/compare for numbers, quote for voices, and image scenes for emotional or hero beats (the system paints them from your "prompt": a manager on the touchline, a stadium in the rain, a dressing room, a trophy, a player in motion — specific subject, setting, mood; style "sketch" for a portrait, "plate" for scenes, "photo" for realism). 1–3 image scenes per video is normal. Footage scenes only when the editor has a clip; never broadcast match footage.
8. Every stat, compare and quote scene has a source ("Outlet · d Mon yyyy").
9. Last scene is cta. First scene is hook. 7–12 scenes total.
9a. Stat, quote and compare scenes get "visuals": whenever the vo names a match, an opponent, a player or a moment, add one visual with that word as the cue and a prompt for THAT moment (e.g. cue "Villa" → "Aston Villa players celebrating a goal in front of dejected Manchester United defenders at Old Trafford, November 2026"; cue "Como" → the same idea for that match). 1–3 visuals per such scene; the first one may use cue = the first word of the vo so the scene never starts bare.
9b. Visual density is mandatory: for 60 s or longer, 2–4 image scenes (the manager, the key player, the stadium, the decisive moment — each with its own "prompt") and, whenever the topic is tactical, 1–2 board scenes. Every board has 3–5 steps; every step after the first MOVES at least two players or the ball ("players" / "ball") and draws at least one arrow; the decisive step uses "zoom" and a "key" arrow. Never two stat scenes in a row; alternate words, numbers and pictures.
10. Tactical boards are illustrative: positions explain the pattern, they are not tracking data; say so ONLY in the research notes, never on screen. "card" is a player portrait card: use it only for one named key player (name = SURNAME, sub = club · minute or role); never for notes, disclaimers or titles; omit it when there is no single key player. Step labels are 1–3 words (e.g. "THE *GAP*", "SIX GO *MAN TO MAN*" is too long → "*MAN TO MAN*"). Sync step "at" seconds to where the vo mentions that beat (estimate from word position × 0.42 s).

OUTPUT FORMAT (exactly two fenced blocks, nothing else after them):
\`\`\`json
{ ...the Script object... }
\`\`\`
\`\`\`md
# Research
## Data sheet
| fact | status | source |
|---|---|---|
...
## Flags on the brief
...
## Sources
- Title — URL
\`\`\`

SCHEMA
${SCHEMA_DOC}`;

type Block = { type: string; text?: string; [k: string]: unknown };
type Msg = { role: "user" | "assistant"; content: string | Block[] };

const call = async (messages: Msg[], tools: boolean, maxTokens: number) => {
  const res = await fetch(API, {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: draftModel(),
      max_tokens: maxTokens,
      system: SYSTEM,
      messages,
      ...(tools ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return (await res.json()) as { content: Block[]; stop_reason: string; usage?: { server_tool_use?: { web_search_requests?: number } } };
};

const textOf = (blocks: Block[]) => blocks.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text as string).join("");
const fence = (text: string, lang: string): string | null => {
  const re = new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)```", "g");
  let m: RegExpExecArray | null, last: string | null = null;
  while ((m = re.exec(text))) last = m[1];
  return last;
};

export type DraftInput = { slug: string; title: string; brief: string; lengthSec: number; series?: string };

/** What a draft is missing visually; empty = good. */
const thinness = (script: ScriptT, input: DraftInput): string[] => {
  const needs: string[] = [];
  const images = script.scenes.filter((s) => s.type === "image").length;
  const boards = script.scenes.filter((s) => s.type === "board");
  const wantImages = input.lengthSec >= 60 ? 2 : 1;
  if (images < wantImages) needs.push(`add ${wantImages - images} more image scene(s) with a specific "prompt" each, placed at emotional or hero beats (manager, key player, stadium, the moment)`);
  const tactical = /tactic|shape|press|formation|defend|defence|defense|midfield|back (four|three|line)|build-up|transition|counter|block|marking|space|gap/i.test(`${input.brief} ${input.title} ${script.scenes.map((s) => s.vo ?? "").join(" ")}`);
  if (tactical && boards.length === 0) needs.push("add a board scene (3–5 steps) that shows the pattern you describe");
  for (const b of boards) {
    const idx = script.scenes.indexOf(b) + 1;
    if (b.type !== "board") continue;
    if (b.steps.length < 3) needs.push(`scene ${idx} (board): give it 3–5 steps`);
    const still = b.steps.slice(1).filter((st) => !(st.players && Object.keys(st.players).length >= 2) && !st.ball);
    if (still.length) needs.push(`scene ${idx} (board): every step after the first must move at least two players or the ball; add "players" moves and arrows to ${still.length} step(s)`);
    if (!b.steps.some((st) => st.arrows?.some((a) => a.style === "key"))) needs.push(`scene ${idx} (board): the decisive step needs a "key" arrow and a "zoom"`);
  }
  for (let i = 1; i < script.scenes.length; i++) {
    if (script.scenes[i].type === "stat" && script.scenes[i - 1].type === "stat") {
      needs.push(`scenes ${i} and ${i + 1} are both stat cards — turn one into a compare, quote or image scene`);
      break;
    }
  }
  return needs;
};
export type DraftResult = { script: ScriptT; research: string; searches: number };

export const draftScript = async (input: DraftInput, report: (m: string) => void): Promise<DraftResult> => {
  if (!draftConfigured()) throw new Error("ANTHROPIC_API_KEY is not set");
  const today = new Date().toISOString().slice(0, 10);
  const user = `Today is ${today}.
Video slug: ${input.slug}
Working title: ${input.title}
Target length: ${input.lengthSec} seconds (≈ ${Math.round(input.lengthSec * 2.3)} voice-over words in total)
${input.series ? `Series tag: ${input.series}\n` : ""}
BRIEF FROM THE EDITOR:
${input.brief.trim() || "(no brief — pick the strongest current Manchester United story and make the case)"}

Research first (several searches), then write. Put id "${input.slug}" in the script.`;

  report("researching with web search…");
  let messages: Msg[] = [{ role: "user", content: user }];
  let searches = 0;
  let resp = await call(messages, true, 9000);
  searches += resp.usage?.server_tool_use?.web_search_requests ?? 0;
  // long-running turns can pause; continue with the assistant content unchanged
  for (let i = 0; i < 4 && resp.stop_reason === "pause_turn"; i++) {
    report("still researching…");
    messages = [...messages, { role: "assistant", content: resp.content }];
    resp = await call(messages, true, 9000);
    searches += resp.usage?.server_tool_use?.web_search_requests ?? 0;
  }
  let text = textOf(resp.content);
  let research = fence(text, "md") ?? fence(text, "markdown") ?? "";
  let jsonText = fence(text, "json");

  let revised = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let parsed: ReturnType<typeof Script.safeParse> | null = null;
    let issues: string[] = [];
    if (jsonText) {
      try {
        const raw = JSON.parse(jsonText) as Record<string, unknown>;
        raw.id = input.slug;
        if (!raw.title) raw.title = input.title;
        raw.brand = "utd";
        raw.voice = raw.voice ?? { provider: "elevenlabs", voiceId: "onwK4e9ZLuTAKqWW03F9", modelId: "eleven_multilingual_v2", stability: 0.45, similarity: 0.8 };
        raw.music = raw.music ?? { src: "placeholder", volume: 0.14, duck: 0.35 };
        raw.captions = raw.captions ?? { mode: "chunk" };
        parsed = Script.safeParse(raw);
        if (!parsed.success) issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      } catch (e) {
        issues = [`JSON parse error: ${(e as Error).message}`];
      }
    } else issues = ["no ```json block found"];

    if (parsed?.success) {
      const needs = thinness(parsed.data, input);
      if (needs.length && !revised) {
        revised = true;
        report(`draft is visually thin (${needs.length} fix${needs.length > 1 ? "es" : ""}) — revising…`);
        messages = [
          ...messages,
          { role: "assistant", content: resp.content },
          { role: "user", content: `Revise the script. Keep the facts and the voice-over tone, but:\n- ${needs.join("\n- ")}\nReturn the full corrected script as a single \`\`\`json block and the research notes as a \`\`\`md block. Do not search again.` },
        ];
        resp = await call(messages, false, 9000);
        text = textOf(resp.content);
        jsonText = fence(text, "json") ?? jsonText;
        research = fence(text, "md") ?? fence(text, "markdown") ?? research;
        attempt--; // this round does not count against repairs
        continue;
      }
      report(`script drafted: ${parsed.data.scenes.length} scenes, ${searches} searches`);
      return { script: parsed.data, research: research.trim(), searches };
    }
    report(`fixing schema issues (${issues.length})…`);
    messages = [
      ...messages,
      { role: "assistant", content: resp.content },
      { role: "user", content: `The script failed validation:\n${issues.slice(0, 20).join("\n")}\n\nReturn the corrected full script as a single \`\`\`json block (keep the research notes block too). Do not search again.` },
    ];
    resp = await call(messages, false, 9000);
    text = textOf(resp.content);
    jsonText = fence(text, "json") ?? jsonText;
    research = fence(text, "md") ?? fence(text, "markdown") ?? research;
  }
  throw new Error("could not produce a valid script after two attempts — try a more specific brief");
};

export const writeResearch = (slug: string, md: string) => fs.writeFileSync(path.join(videoDir(slug), "research.md"), md + "\n");
export const readResearch = (slug: string): string | null => {
  const p = path.join(videoDir(slug), "research.md");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};
