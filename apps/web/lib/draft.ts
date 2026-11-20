// AI drafting: brief → researched script.json + research.md, via the Claude API with live web search.
// Needs ANTHROPIC_API_KEY or OPENAI_API_KEY (see @utd/video/ai for which one is used).
import fs from "node:fs";
import path from "node:path";
import type { Script as ScriptT } from "@utd/video/schema";
import { normalizeScript, scriptIssues } from "@utd/video/normalize";
import { videoDir } from "./store";
import { claude, configured, model, textOf, toolInput, type Block, type Msg, type Reply } from "./claude";

export const draftConfigured = configured;
export const draftModel = model;

const SCHEMA_DOC = `
Script = {
  id: string, title: string, brand: "utd", series: string (page tag, e.g. "MATCH DIARY", "TRANSFER WATCH", "TACTICS"),
  voice: { provider: "elevenlabs", voiceId: "onwK4e9ZLuTAKqWW03F9", modelId: "eleven_multilingual_v2", stability: 0.45, similarity: 0.8 },
  music: { src: "placeholder", volume: 0.14, duck: 0.35 },
  captions: { mode: "chunk" },
  scenes: Scene[]   // 6–10 scenes, first is hook, last is cta
}
Common optional fields on every scene: vo (string, the spoken line), hold (seconds), sfx ("whoosh"|"hit"|"tick"|"riser"|"none"),
visuals?: [{ cue: string (ONE word copied from this scene's vo, e.g. "Villa"), prompt: string (a real MOMENT as a press photo: who, where, what is happening, emotion — no portraits-by-default, no symbolism), style: "photo" (default; "plate" only for abstract beats), person?: string (full name of the real person who must be recognisable; leave the key out when nobody specific) }] — for stat, quote, compare and cta scenes: pictures that fade in behind the card the moment the cue word is spoken. Vary them across the video (faces, wide stadium, action, dugout, tunnel, fans); the same face at most twice per video.
Scene types:
 { type:"hook", word: string (ONE word, max two, uppercase, curiosity not description, may end with ?), kicker?: string (place · date), sub?: string (one sentence), bgPrompt: string (the opening background picture as a press photo: the main subject of the video — the named person, or the team as a group if it is about the team — setting, moment, mood), bgPerson?: string (that person's full name; leave the key out when it is the team), vo }
 { type:"stat", value: number, label: string (UPPERCASE, e.g. "TACKLES · 24/25"), prefix?: "£", suffix?: "%", decimals?: 0|1, context?: string (one sentence above the card), gold?: boolean (ONLY the single headline stat), source: string, vo }
 { type:"quote", text: string (verbatim), who: string, source: string ("Outlet · d Mon yyyy"), vo }
 { type:"compare", title?: string (UPPERCASE), left:{name, sub?}, right:{name, sub?}, rows: [{label, left:number, right:number, lowerIsBetter?: boolean}] (2–5 rows), source: string, vo }
 { type:"board", title?: string (UPPERCASE, *asterisks* for a gold word), card?: {name, sub?}, ball?: {x,y},
   players: [{id, team:"home"|"away", x:0-100, y:0-100, name?: SURNAME}] (home = Manchester United, defends the bottom goal y≈92; away attacks downward from y≈6; ids like h_gk,h_lb,h_lcb,h_rcb,h_rb,h_dm1,h_dm2,h_lw,h_am,h_rw,h_st and a_gk,a_lb,... ; 11 each; only name 3–5 key players),
   steps: [ { at?: seconds into scene (sync with the vo wording), label?: string, players?: {[id]:{x,y}} (moves), ball?: {x,y}, lines?: [{from:id,to:id}], arrows?: [{from: id|{x,y}, to: id|{x,y}, style:"pass"|"run"|"key"|"press", curve?: -1..1}], highlight?: id[], zone?: {x,y,rx,ry,label?}, zoom?: {x,y,scale:1-1.6} } ] (2–4 steps; step 1 usually just shape lines; the "key" arrow in the last step),
   vo }
 { type:"image", src: "", prompt: string (what to paint: subject, setting, moment, mood — 1–2 sentences, no text in the picture), person?: string (full name if a real person must be recognisable; leave the key out otherwise), style?: "photo" (people/places) | "plate" (abstract) | "sketch", caption: string (3–6 words, UPPERCASE), vo }   // the system generates the picture from prompt
 { type:"footage", src: "", from?: 0, to?: 6, label?: string, caption: string, vo }        // only if the editor has a clip; never broadcast footage
 { type:"cta", line?: string, vo }
Coordinates: x 0 = left touchline, 100 = right; y 0 = top goal line, 100 = bottom goal line. Keep players within y 8–88.
`;

const SYSTEM = `You write scripts for "UTD Diaries", a Manchester United short-video page (Facebook Reels, TikTok, Shorts). You output a JSON script for a 1080×1920 video generator, plus research notes. The scripts are voiced by a British broadcaster voice and captioned word by word.

NON-NEGOTIABLE RULES
1. Verify everything live with web_search before you state it: results, scorers, minutes, transfers, fees, stats, quotes, the current manager, who is in the squad. Assume your memory is out of date; it often is.
2. Every claim in the research notes carries a status: CONFIRMED (official source or several reliable outlets), AGREED (deal agreed, not announced), RUMOUR (single outlet / speculation), TARGET (interest only). Only CONFIRMED facts go on screen in stat, compare and quote scenes. Quotes are verbatim, with outlet and date.
3. If the brief contains a factual error or an outdated assumption, flag it in the research notes with the correct version and source, and write the script on the correct facts.
4. The script must sound human: conviction, reasoning, short sentences, a point of view. No robotic readouts, no "in this video". Short-form pace ≈ 2.9 words per second: total voice-over words ≈ target_seconds × 2.8. Punchy: each scene's vo is 1–2 short sentences, no filler, no throat-clearing — every line earns the next swipe.
5. Hook word: ONE word (two at most), uppercase, that creates curiosity rather than describes ("HIJACK?" not "BARGAIN"). Kicker = place · date when it is a match story.
6. At most one gold stat card, for the single headline number.
7. Mix the scene types for rhythm: boards for tactics, stat/compare for numbers, quote for voices, and image scenes for emotional or hero beats (the system paints them from your "prompt": a manager on the touchline, a stadium in the rain, a dressing room, a trophy, a player in motion — specific subject, setting, mood; style "sketch" for a portrait, "plate" for scenes, "photo" for realism). 1–3 image scenes per video is normal. Footage scenes only when the editor has a clip; never broadcast match footage.
8. Every stat, compare and quote scene has a source ("Outlet · d Mon yyyy").
9. Last scene is cta. First scene is hook. 7–12 scenes total.
9a. Stat, quote and compare scenes get "visuals": whenever the vo names a match, an opponent, a player or a moment, add one visual with that word as the cue and a prompt for THAT moment (e.g. cue "Villa" → "Aston Villa players celebrating a goal in front of dejected Manchester United defenders at Old Trafford, November 2026"; cue "Como" → the same idea for that match). 1–3 visuals per such scene; the first one may use cue = the first word of the vo so the scene never starts bare.
9b. Visual density is mandatory: for 60 s or longer, 2–4 image scenes (the manager, the key player, the stadium, the decisive moment — each with its own "prompt") and, whenever the topic is tactical, 1–2 board scenes. Every board has 3–5 steps; every step after the first MOVES at least two players or the ball ("players" / "ball") and draws at least one arrow; the decisive step uses "zoom" and a "key" arrow. Never two stat scenes in a row; alternate words, numbers and pictures.
10. Tactical boards are illustrative: positions explain the pattern, they are not tracking data; say so ONLY in the research notes, never on screen. "card" is a player portrait card: use it only for one named key player (name = SURNAME, sub = club · minute or role); never for notes, disclaimers or titles; omit it when there is no single key player. Step labels are 1–3 words (e.g. "THE *GAP*", "SIX GO *MAN TO MAN*" is too long → "*MAN TO MAN*"). Sync step "at" seconds to where the vo mentions that beat (estimate from word position × 0.42 s).

HOW TO HAND IT IN
When the research is done, call the publish_script tool ONCE with { script, research }: script = the Script object below, research = markdown notes:
# Research
## Data sheet
| fact | status | source |
|---|---|---|
...
## Flags on the brief
...
## Sources
- Title — URL
Never write the script as text and never use null — leave a key out instead. Numbers are numbers (72, not "72").

SCHEMA
${SCHEMA_DOC}`;

/** The script is handed over through this tool: valid JSON by construction, so no fence-hunting and no "fix your JSON" rounds. */
const PUBLISH = {
  name: "publish_script",
  description: "Hand in the finished video script and the research notes. Call it once the research is done. `script` is the Script object described in the SCHEMA section of your instructions; `research` is the markdown research notes.",
  input_schema: {
    type: "object",
    properties: {
      script: { type: "object", description: "The Script object: id, title, brand, series, voice, music, captions, scenes[]." },
      research: { type: "string", description: "Markdown: # Research, ## Data sheet (fact | status | source), ## Flags on the brief, ## Sources (Title — URL)." },
    },
    required: ["script", "research"],
  },
};

type CallOpts = { search?: boolean; force?: boolean; maxTokens?: number };
/** `force` asks for the tool call outright; the shared client turns it into "auto" on models that refuse forcing. */
const call = (messages: Msg[], opts: CallOpts = {}): Promise<Reply> =>
  claude({
    max_tokens: opts.maxTokens ?? 12000,
    system: SYSTEM,
    messages,
    tools: [...(opts.search ? [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }] : []), PUBLISH],
    tool_choice: opts.force ? { type: "tool", name: PUBLISH.name } : { type: "auto" },
  });

const fence = (text: string, lang: string): string | null => {
  const re = new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)```", "g");
  let m: RegExpExecArray | null, last: string | null = null;
  while ((m = re.exec(text))) last = m[1];
  return last;
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

type Handed = { toolUseId?: string; script: unknown; research: string };
/** What the model handed in: the publish_script call, or (old habit) a ```json block in its text. */
const handedIn = (reply: Reply): Handed | null => {
  const tu = toolInput(reply, PUBLISH.name);
  if (tu && (isObj(tu.input.script) || Array.isArray(tu.input.scenes))) {
    const inp = tu.input;
    const research = typeof inp.research === "string" ? inp.research : typeof inp.notes === "string" ? inp.notes : "";
    return { toolUseId: tu.id, script: isObj(inp.script) ? inp.script : inp, research };
  }
  const text = textOf(reply.content);
  const j = fence(text, "json");
  if (j) {
    try {
      return { script: JSON.parse(j), research: fence(text, "md") ?? fence(text, "markdown") ?? "" };
    } catch {
      /* fall through */
    }
  }
  return null;
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
export type DraftResult = { script: ScriptT; research: string; searches: number; notes: string[] };

const short = (list: string[], n = 4) => list.slice(0, n).join(" · ") + (list.length > n ? ` · +${list.length - n} more` : "");

/**
 * brief → researched script. Claude researches with web search and hands the script in through publish_script;
 * the normaliser makes it schema-true deterministically (nulls, numbers-as-strings, synonyms, missing teams…),
 * degrading a hopeless scene to a picture instead of failing. Claude is asked again only for things code cannot
 * decide: a visually thin draft (once) or a script with no usable scenes (twice).
 */
export const draftScript = async (input: DraftInput, report: (m: string) => void): Promise<DraftResult> => {
  if (!draftConfigured()) throw new Error("No AI key — add OPENAI_API_KEY (or ANTHROPIC_API_KEY) to .env");
  const today = new Date().toISOString().slice(0, 10);
  const user = `Today is ${today}.
Video slug: ${input.slug}
Working title: ${input.title}
Target length: ${input.lengthSec} seconds (≈ ${Math.round(input.lengthSec * 2.8)} voice-over words in total)
${input.series ? `Series tag: ${input.series}\n` : ""}
BRIEF FROM THE EDITOR:
${input.brief.trim() || "(no brief — pick the strongest current Manchester United story and make the case)"}

Research first (several searches), then call publish_script. Put id "${input.slug}" in the script.`;

  report("researching with web search…");
  let messages: Msg[] = [{ role: "user", content: user }];
  let searches = 0;
  let resp = await call(messages, { search: true });
  searches += resp.usage?.server_tool_use?.web_search_requests ?? 0;
  for (let i = 0; i < 4 && resp.stop_reason === "pause_turn"; i++) {
    report("still researching…");
    messages = [...messages, { role: "assistant", content: resp.content }];
    resp = await call(messages, { search: true });
    searches += resp.usage?.server_tool_use?.web_search_requests ?? 0;
  }

  /** Send feedback and get a new hand-in. Through the tool result when the last reply was a tool call, otherwise as a message. */
  const again = async (got: Handed | null, feedback: string, maxTokens?: number): Promise<Reply> => {
    const content: Block[] | string = got?.toolUseId ? [{ type: "tool_result", tool_use_id: got.toolUseId, content: feedback }] : feedback;
    messages = [...messages, { role: "assistant", content: resp.content }, { role: "user", content }];
    return call(messages, { force: true, maxTokens });
  };

  let got = handedIn(resp);
  let revised = false;
  let lastRaw: unknown = null;
  let lastIssue = "";
  for (let round = 0; round < 4; round++) {
    if (!got) {
      if (resp.stop_reason === "max_tokens") {
        report("answer hit the length limit — asking for a tighter version…");
        resp = await again(null, "Your answer was cut off by the length limit. Call publish_script now with the full script (every scene) and shorter research notes; keep image prompts to one sentence.", 16000);
      } else {
        report("script not handed in — asking for it…");
        resp = await again(null, "Call publish_script now with the script and research notes you have prepared. Do not search again.");
      }
      got = handedIn(resp);
      if (!got) {
        lastIssue = "the model did not hand in a script";
        continue;
      }
    }
    lastRaw = got.script;
    let normalized: ReturnType<typeof normalizeScript>;
    try {
      normalized = normalizeScript(got.script, { id: input.slug, title: input.title, series: input.series });
    } catch (e) {
      lastIssue = (e as Error).message;
      const issues = scriptIssues(got.script);
      report(`script unusable (${lastIssue}) — asking for a corrected one…`);
      resp = await again(got, `The script could not be used: ${lastIssue}.${issues.length ? `\nValidation issues:\n${issues.slice(0, 15).join("\n")}` : ""}\nCall publish_script again with the full corrected script (same facts, same voice-over). Do not search again.`);
      got = handedIn(resp);
      continue;
    }
    const { script, notes } = normalized;
    if (notes.length) report(`tidied the script: ${short(notes, 3)}`);
    const needs = thinness(script, input);
    if (needs.length && !revised) {
      revised = true;
      report(`draft is visually thin (${needs.length} fix${needs.length > 1 ? "es" : ""}) — revising…`);
      resp = await again(got, `Revise the script. Keep the facts and the voice-over tone, but:\n- ${needs.join("\n- ")}\nCall publish_script again with the full corrected script and the research notes. Do not search again.`);
      got = handedIn(resp);
      continue;
    }
    report(`script drafted: ${script.scenes.length} scenes, ${searches} searches`);
    return { script, research: got.research.trim(), searches, notes };
  }

  // Nothing usable after several rounds: keep the evidence next to the video so the cause can be fixed in code.
  try {
    fs.writeFileSync(path.join(videoDir(input.slug), "draft-failed.json"), JSON.stringify({ at: new Date().toISOString(), input, issue: lastIssue, script: lastRaw }, null, 2));
  } catch {
    /* best effort */
  }
  throw new Error(`could not get a usable script (${lastIssue || "unknown"}) — details saved to draft-failed.json in the video folder; try again or sharpen the brief`);
};

export const writeResearch = (slug: string, md: string) => fs.writeFileSync(path.join(videoDir(slug), "research.md"), md + "\n");
export const readResearch = (slug: string): string | null => {
  const p = path.join(videoDir(slug), "research.md");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};
