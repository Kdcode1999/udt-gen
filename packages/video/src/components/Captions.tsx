import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Brand } from "../brand";
import { chunkWords, type TimedWord } from "../timing";
import { pop } from "./ui";

/**
 * Word-timed captions in the house style: one short chunk at a time, Anton,
 * uppercase, active word in gold. Positioned above the bottom safe zone.
 */
export const Captions: React.FC<{
  brand: Brand;
  words: TimedWord[];
  mode?: "chunk" | "word" | "off";
  y?: number;
}> = ({ brand, words, mode = "chunk", y = 1440 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chunks = useMemo(() => (mode === "off" ? [] : chunkWords(words, mode)), [words, mode]);
  if (!chunks.length) return null;

  const chunk = chunks.find((c) => frame >= c.start && frame < c.end);
  if (!chunk) return null;

  const s = pop(frame, fps, chunk.start);
  const scale = 0.86 + 0.14 * s;
  const text = chunk.words.map((w) => w.text).join(" ");
  const size = text.length > 16 ? 72 : text.length > 11 ? 84 : 96;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: y - size * 0.6,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          fontFamily: brand.fonts.display,
          fontSize: size,
          lineHeight: 1,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: brand.colors.white,
          textAlign: "center",
          padding: "16px 28px",
          maxWidth: 940,
          textShadow:
            "4px 4px 0 #0A0A0C, -4px -4px 0 #0A0A0C, 4px -4px 0 #0A0A0C, -4px 4px 0 #0A0A0C, 0 6px 0 #0A0A0C, 0 0 28px rgba(10,10,12,.7)",
          display: "flex",
          gap: "0.28em",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {chunk.words.map((w, i) => {
          const active = frame >= w.start && (i === chunk.words.length - 1 || frame < chunk.words[i + 1].start);
          const done = frame >= w.start;
          return (
            <span
              key={i}
              style={{
                color: active ? brand.colors.gold : done ? brand.colors.white : "rgba(246,246,244,0.55)",
                transform: active ? "translateY(-4px)" : undefined,
                display: "inline-block",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
