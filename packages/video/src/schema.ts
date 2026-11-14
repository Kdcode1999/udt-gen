// script.json schema. One file per video: videos/<slug>/script.json
// Every scene may carry `vo` (voice-over line), `duration` (seconds, floor),
// `hold` (extra seconds after the VO ends), `sfx` (cue at scene start) and
// `captions: false` to hide word captions on that scene.
import { z } from "zod";

export const SfxName = z.enum(["whoosh", "hit", "tick", "riser", "none"]);

/** A background picture that appears when a word in the voice-over is spoken (or at a time). */
export const Visual = z.object({
  cue: z.string().optional(), // word(s) in the vo, e.g. "Villa" — shows when spoken
  at: z.number().min(0).optional(), // or seconds into the scene (0 = from the start)
  prompt: z.string().optional(), // what to paint; the system adds the subject's current look
  style: z.enum(["plate", "sketch", "photo"]).optional(), // default photo
  src: z.string().optional(), // generated/uploaded file
});
export type VisualT = z.infer<typeof Visual>;


const base = {
  id: z.string().optional(),
  vo: z.string().optional(),
  duration: z.number().positive().optional(),
  hold: z.number().min(0).optional(),
  sfx: SfxName.optional(),
  captions: z.boolean().optional(),
  visuals: z.array(Visual).max(6).optional(), // stat / quote / compare / cta: pictures that follow the voice-over
};

export const Point = z.object({ x: z.number(), y: z.number() });



export const HookScene = z.object({
  ...base,
  type: z.literal("hook"),
  kicker: z.string().optional(), // small red line above the word
  word: z.string(), // the one-word hook, e.g. "HIJACK?"
  sub: z.string().optional(),
  bg: z.string().optional(), // background picture of the subject (generated from bgPrompt or uploaded)
  bgPrompt: z.string().optional(), // who/what the video is about, as they look right now
});

export const StatScene = z.object({
  ...base,
  type: z.literal("stat"),
  context: z.string().optional(), // line above the card
  value: z.number(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  decimals: z.number().int().min(0).max(2).optional(),
  label: z.string(), // e.g. "TACKLES · 24/25"
  gold: z.boolean().optional(), // reserve for the headline stats only
  source: z.string().optional(),
});

export const QuoteScene = z.object({
  ...base,
  type: z.literal("quote"),
  text: z.string(),
  who: z.string(),
  source: z.string().optional(), // "Sky Sports · 12 Oct 2026"
  img: z.string().optional(), // portrait (assets/… or https://…)
});

export const CompareRow = z.object({
  label: z.string(),
  left: z.number(),
  right: z.number(),
  leftLabel: z.string().optional(),
  rightLabel: z.string().optional(),
  lowerIsBetter: z.boolean().optional(),
});

export const CompareScene = z.object({
  ...base,
  type: z.literal("compare"),
  title: z.string().optional(),
  left: z.object({ name: z.string(), sub: z.string().optional() }),
  right: z.object({ name: z.string(), sub: z.string().optional() }),
  rows: z.array(CompareRow).min(1).max(6),
  source: z.string().optional(),
});

export const BoardPlayer = z.object({
  id: z.string(),
  team: z.enum(["home", "away"]),
  x: z.number().min(0).max(100), // 0 = left touchline, 100 = right touchline
  y: z.number().min(0).max(100), // 0 = top goal line, 100 = bottom goal line
  name: z.string().optional(),
  number: z.union([z.number(), z.string()]).optional(),
});

export const Ref = z.union([z.string(), Point]); // player id or pitch point

export const BoardArrow = z.object({
  from: Ref,
  to: Ref,
  style: z.enum(["pass", "run", "key", "press"]).optional(),
  curve: z.number().min(-1).max(1).optional(), // bend; 0 = straight
});

export const BoardLine = z.object({
  from: z.string(),
  to: z.string(),
  color: z.enum(["red", "white", "gold"]).optional(),
});

export const BoardStep = z.object({
  at: z.number().min(0).optional(), // seconds into the scene; auto-spaced if omitted
  label: z.string().optional(), // big word; wrap a part in *asterisks* for gold
  players: z.record(z.string(), Point).optional(), // moves (persist to later steps)
  ball: Point.optional(),
  lines: z.array(BoardLine).optional(),
  arrows: z.array(BoardArrow).optional(),
  highlight: z.array(z.string()).optional(),
  zone: z.object({ x: z.number(), y: z.number(), rx: z.number(), ry: z.number(), label: z.string().optional() }).optional(),
  zoom: z.object({ x: z.number(), y: z.number(), scale: z.number().min(1).max(3) }).optional(),
});

export const BoardScene = z.object({
  ...base,
  type: z.literal("board"),
  title: z.string().optional(), // shown until the first step label replaces it
  homeColor: z.string().optional(),
  awayColor: z.string().optional(),
  players: z.array(BoardPlayer).min(1),
  ball: Point.optional(),
  card: z
    .object({
      name: z.string(),
      sub: z.string().optional(),
      img: z.string().optional(), // sketch/AI plate; monogram card if omitted
      prompt: z.string().optional(), // subject to sketch, e.g. "Jude Bellingham, Real Madrid midfielder"
      side: z.enum(["left", "right"]).optional(),
    })
    .optional(),
  steps: z.array(BoardStep).min(1),
});

export const ImageStyle = z.enum(["plate", "sketch", "photo"]);

export const ImageScene = z.object({
  ...base,
  type: z.literal("image"),
  src: z.string(), // "" = not yet generated/uploaded; the scene renders a designed caption plate until then
  prompt: z.string().optional(), // what to generate (pnpm images / the Images button)
  style: ImageStyle.optional(), // plate (default) | sketch | photo
  caption: z.string().optional(),
  source: z.string().optional(),
  kenburns: z.enum(["in", "out", "left", "right", "none"]).optional(),
  fit: z.enum(["cover", "contain"]).optional(),
});

export const FootageScene = z.object({
  ...base,
  type: z.literal("footage"),
  src: z.string(),
  from: z.number().min(0).optional(), // seconds into the clip
  to: z.number().min(0).optional(),
  label: z.string().optional(), // pill, e.g. "VS BRENTFORD · OCT 2026"
  caption: z.string().optional(),
  muted: z.boolean().optional(), // default true (voice-over runs on top)
  volume: z.number().min(0).max(1).optional(),
  playbackRate: z.number().positive().optional(),
});

export const CtaScene = z.object({
  ...base,
  type: z.literal("cta"),
  line: z.string().optional(),
  sub: z.string().optional(),
});

export const Scene = z.discriminatedUnion("type", [
  HookScene,
  StatScene,
  QuoteScene,
  CompareScene,
  BoardScene,
  ImageScene,
  FootageScene,
  CtaScene,
]);

export const Script = z.object({
  id: z.string(),
  title: z.string(),
  brand: z.string().optional(),
  series: z.string().optional(), // page tag text, e.g. "TRANSFER WATCH"
  voice: z
    .object({
      provider: z.enum(["elevenlabs", "edge", "estimate"]).optional(),
      voiceId: z.string().optional(),
      modelId: z.string().optional(),
      stability: z.number().min(0).max(1).optional(),
      similarity: z.number().min(0).max(1).optional(),
      style: z.number().min(0).max(1).optional(),
      speed: z.number().min(0.7).max(1.2).optional(),
    })
    .optional(),
  music: z
    .object({
      src: z.string().optional(), // assets/… ; "placeholder" uses the bundled bed
      volume: z.number().min(0).max(1).optional(),
      duck: z.number().min(0).max(1).optional(), // multiplier under voice
    })
    .optional(),
  captions: z
    .object({
      mode: z.enum(["chunk", "word", "off"]).optional(),
      y: z.number().optional(), // baseline from top, default 1440
    })
    .optional(),
  debug: z.boolean().optional(), // draws the safe-zone overlay
  scenes: z.array(Scene).min(1),
});

export type Script = z.infer<typeof Script>;
export type Scene = z.infer<typeof Scene>;
export type SceneOf<T extends Scene["type"]> = Extract<Scene, { type: T }>;
export type BoardStepT = z.infer<typeof BoardStep>;
export type BoardPlayerT = z.infer<typeof BoardPlayer>;

/** vo/manifest.json — written by `pnpm vo`, read by the timing engine. */
export const VoWord = z.object({ w: z.string(), s: z.number(), e: z.number() }); // seconds
export const VoSceneEntry = z.object({
  file: z.string().optional(), // relative to the video dir, e.g. "vo/scene-01.mp3"
  duration: z.number(), // seconds of audio (or estimated speech time)
  words: z.array(VoWord),
  text: z.string(),
  hash: z.string(),
  estimated: z.boolean().optional(),
});
export const VoManifest = z.object({
  provider: z.string(),
  voiceId: z.string().optional(),
  generatedAt: z.string(),
  scenes: z.record(z.string(), VoSceneEntry), // key = scene index as string
});
export type VoManifest = z.infer<typeof VoManifest>;
export type VoSceneEntry = z.infer<typeof VoSceneEntry>;
