// Timing engine: script + VO manifest → frame-accurate timeline.
// Scene length = max(type minimum, declared duration, VO length + tail) + hold.
// Word timings come from the VO manifest (ElevenLabs timestamps) or are
// estimated from text when no audio exists yet.
import type { Script, Scene, VoManifest } from "./schema";

export type TimedWord = { text: string; start: number; end: number }; // frames, relative to scene start

export type TimedScene = {
  index: number;
  type: Scene["type"];
  start: number; // absolute frame
  duration: number; // frames
  voDuration: number; // frames of speech (0 if none)
  audio?: string; // staticFile path, relative to the video dir
  words: TimedWord[];
};

export type Timeline = {
  fps: number;
  total: number;
  scenes: TimedScene[];
};

const WORDS_PER_SECOND = 2.6; // conversational VO pace used for estimates
const TAIL_SECONDS = 0.45; // breathing room after the last word

const MIN_SECONDS: Record<Scene["type"], number> = {
  hook: 2.2,
  stat: 3.0,
  quote: 3.5,
  compare: 4.0,
  board: 3.0,
  image: 3.0,
  footage: 3.0,
  cta: 3.0,
};

export const splitWords = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

export const estimateSpeechSeconds = (text: string): number => {
  const words = splitWords(text);
  if (!words.length) return 0;
  const chars = words.join("").length;
  // blend word count and character count so long words cost more
  return Math.max(0.8, words.length / WORDS_PER_SECOND * 0.6 + chars / 14 * 0.4 + 0.3);
};

/** Spread words across a duration proportionally to their length (estimate mode). */
export const estimateWordTimes = (text: string, seconds: number): { w: string; s: number; e: number }[] => {
  const words = splitWords(text);
  if (!words.length) return [];
  const lead = 0.12;
  const usable = Math.max(0.5, seconds - lead - 0.1);
  const weights = words.map((w) => w.length + 2.5 + (/[.,!?;:]$/.test(w) ? 3 : 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  let t = lead;
  return words.map((w, i) => {
    const d = (weights[i] / sum) * usable;
    const entry = { w, s: t, e: t + d * 0.85 };
    t += d;
    return entry;
  });
};

const sceneFloorSeconds = (scene: Scene): number => {
  let min = MIN_SECONDS[scene.type];
  if (scene.type === "board") {
    min = Math.max(min, scene.steps.length * 1.6 + 0.8);
  }
  if (scene.type === "footage" && scene.from != null && scene.to != null) {
    min = Math.max(min, (scene.to - scene.from) / (scene.playbackRate ?? 1));
  }
  if (scene.type === "compare") {
    min = Math.max(min, 2.2 + scene.rows.length * 0.5);
  }
  return min;
};

export const buildTimeline = (script: Script, vo: VoManifest | null | undefined, fps: number): Timeline => {
  let cursor = 0;
  const scenes: TimedScene[] = script.scenes.map((scene, index) => {
    const entry = vo?.scenes?.[String(index)];
    const text = scene.vo?.trim() ?? "";

    let voSeconds = 0;
    let wordTimes: { w: string; s: number; e: number }[] = [];
    let audio: string | undefined;

    if (entry && entry.text.trim() === text && text) {
      voSeconds = entry.duration;
      wordTimes = entry.words;
      audio = entry.file;
    } else if (text) {
      voSeconds = estimateSpeechSeconds(text);
      wordTimes = estimateWordTimes(text, voSeconds);
    }

    const floor = sceneFloorSeconds(scene);
    const declared = scene.duration ?? 0;
    const seconds = Math.max(floor, declared, voSeconds + (voSeconds ? TAIL_SECONDS : 0)) + (scene.hold ?? 0);
    const duration = Math.max(1, Math.round(seconds * fps));

    const words: TimedWord[] = wordTimes.map((w) => ({
      text: w.w,
      start: Math.round(w.s * fps),
      end: Math.max(Math.round(w.s * fps) + 1, Math.round(w.e * fps)),
    }));

    const timed: TimedScene = {
      index,
      type: scene.type,
      start: cursor,
      duration,
      voDuration: Math.round(voSeconds * fps),
      audio,
      words,
    };
    cursor += duration;
    return timed;
  });

  return { fps, total: cursor, scenes };
};

/** Caption chunks: up to 3 words / ~18 chars, break at punctuation. */
export type Chunk = { words: TimedWord[]; start: number; end: number };

export const chunkWords = (words: TimedWord[], mode: "chunk" | "word" = "chunk"): Chunk[] => {
  if (!words.length) return [];
  const chunks: Chunk[] = [];
  let cur: TimedWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    chunks.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  for (const w of words) {
    const len = cur.reduce((a, b) => a + b.text.length + 1, 0) + w.text.length;
    if (mode === "word" || cur.length >= 3 || len > 18) flush();
    cur.push(w);
    if (/[.!?;:]$/.test(w.text) || (mode === "chunk" && /,$/.test(w.text) && cur.length >= 2)) flush();
  }
  flush();
  // extend each chunk to the next chunk's start so captions never flicker off between words
  for (let i = 0; i < chunks.length; i++) {
    const next = chunks[i + 1];
    chunks[i].end = next ? Math.max(chunks[i].end, next.start) : chunks[i].end + 10;
  }
  return chunks;
};

export const toSrtTime = (frame: number, fps: number): string => {
  const ms = Math.round((frame / fps) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
};
