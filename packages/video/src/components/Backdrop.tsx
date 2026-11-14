import React, { useMemo } from "react";
import { Img, interpolate, useCurrentFrame } from "remotion";
import type { Brand } from "../brand";
import type { VisualT } from "../schema";
import type { TimedWord } from "../timing";
import { asset } from "./ui";

const norm = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

/** Frame at which a visual should appear: its cue word in the voice-over, or its `at` time, or 0. */
export const visualStart = (v: VisualT, words: TimedWord[], fps: number, index: number, total = 1, duration = 0): number => {
  if (v.at != null) return Math.round(v.at * fps);
  if (v.cue) {
    const cue = v.cue.split(/\s+/).map(norm).filter(Boolean);
    for (let i = 0; i + cue.length <= words.length; i++) {
      if (cue.every((c, j) => norm(words[i + j].text).startsWith(c))) return Math.max(0, words[i].start - 6);
    }
  }
  // cue not in the voice-over: still change pictures, evenly across the scene
  return index === 0 ? 0 : Math.round((index * duration) / Math.max(1, total));
};

/**
 * Picture layer behind a scene: visuals crossfade in when their cue is spoken,
 * each with a slow push-in, under a dark grade so the card/text stays legible.
 */
export const Backdrop: React.FC<{ visuals: VisualT[]; words: TimedWord[]; duration: number; fps: number; brand: Brand; tint?: number }> = ({ visuals, words, duration, fps, brand, tint = 0.5 }) => {
  const frame = useCurrentFrame();
  const shots = useMemo(() => {
    const starts = visuals.map((v, i) => visualStart(v, words, fps, i, visuals.length, duration));
    return visuals
      .map((v, i) => ({ v, start: starts[i], i }))
      .filter((s) => s.v.src && s.start >= 0)
      .sort((a, b) => a.start - b.start)
      .map((s, idx, arr) => ({ ...s, end: arr[idx + 1]?.start ?? duration }));
  }, [visuals, words, fps, duration]);
  if (!shots.length) return null;
  return (
    <>
      {shots.map((s) => {
        const o = interpolate(frame, [s.start, s.start + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        if (frame < s.start || frame > s.end + 12) return null;
        const t = interpolate(frame, [s.start, s.end], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <Img
            key={s.i}
            src={asset(s.v.src!)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 25%", transform: `scale(${1.04 + 0.1 * t})`, opacity: o }}
          />
        );
      })}
      <div style={{ position: "absolute", inset: 0, background: `rgba(10,10,12,${tint})` }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,10,12,.55) 0%, rgba(10,10,12,.1) 30%, rgba(10,10,12,.25) 60%, rgba(10,10,12,.92) 100%)" }} />
      <span style={{ display: "none" }}>{brand.id}</span>
    </>
  );
};
