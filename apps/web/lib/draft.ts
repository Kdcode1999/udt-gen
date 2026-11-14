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
Common optional fields on every scene: vo (string, the spoken line), hold (seconds), sfx ("whoosh"|"hit"|"tick"|"riser"|"none").
Scene types:
 { type:"hook", word: string (ONE word, max two, uppercase, curiosity not description, may end with ?), kicker?: string (place · date), sub?: string (one sentence), vo }
 { type:"stat", value: number, label: string (UPPERCASE, e.g. "TACKLES · 24/25"), prefix?: "£", suffix?: "%", decimals?: 0|1, context?: string (one sentence above the card), gold?: boolean (ONLY the single headline stat), source: string, vo }
 { type:"quote", text: string (verbatim), who: string, source: string ("Outlet · d Mon yyyy"), vo }
 { type:"compare", title?: string (UPPERCASE), left:{name, sub?}, right:{name, sub?}, rows: [{label, left:number, right:number, lowerIsBetter?: boolean}] (2–5 rows), source: string, vo }
 { type:"board", title?: string (UPPERCASE, *asterisks* for a gold word), card?: {name, sub?}, ball?: {x,y},
   players: [{id, team:"home"|"away", x:0-100, y:0-100, name?: SURNAME}] (home = Manchester United, defends the bottom goal y≈92; away attacks downward from y≈6; ids like h_gk,h_lb,h_lcb,h_rcb,h_rb,h_dm1,h_dm2,h_lw,h_am,h_rw,h_st and a_gk,a_lb,... ; 11 each; only name 3–5 key players),
   steps: [ { at?: seconds into scene (sync with the vo wording), label?: string, players?: {[id]:{x,y}} (moves), ball?: {x,y}, lines?: [{from:id,to:id}], arrows?: [{from: id|{x,y}, to: id|{x,y}, style:"pass"|"run"|"key"|"press", curve?: -1..1}], highlight?: id[], zone?: {x,y,rx,ry,label?}, zoom?: {x,y,scale:1-1.6} } ] (2–4 steps; step 1 usually just shape lines; the "key" arrow in the last step),
   vo }
 { type:"image", src: "", prompt: string (what to paint: subject, setting, mood — 1–2 sentences, no text in the picture), style?: "plate"|"sketch"|"photo", caption: string (3–6 words, UPPERCASE), vo }   // the system generates the picture from prompt
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
9. Last scene is cta. First scene is hook. 6–10 scenes total.
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
