import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { SAFE, type Brand } from "../brand";
import type { SceneOf } from "../schema";
import { Glow, pop, ramp, settle } from "../components/ui";

const wordSize = (w: string) => (w.length <= 5 ? 320 : w.length <= 7 ? 270 : w.length <= 9 ? 220 : w.length <= 12 ? 170 : 130);

export const Hook: React.FC<{ scene: SceneOf<"hook">; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slam = pop(frame, fps, 2);
  const bar = ramp(frame, 10, 14);
  const sub = settle(frame, fps, 16);
  const kick = settle(frame, fps, 0);
  const shake = frame > 4 && frame < 9 ? (frame % 2 ? 6 : -6) : 0;

  return (
    <AbsoluteFill style={{ background: brand.colors.ink }}>
      <Glow brand={brand} y={880} />
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: 640, transform: `translateX(${shake}px)` }}>
        {scene.kicker && (
          <div
            style={{
              fontFamily: brand.fonts.body,
              fontWeight: 900,
              fontSize: 34,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: brand.colors.red,
              opacity: kick,
              transform: `translateY(${(1 - kick) * 16}px)`,
              marginBottom: 20,
            }}
          >
            {scene.kicker}
          </div>
        )}
        <div
          style={{
            fontFamily: brand.fonts.display,
            fontSize: wordSize(scene.word),
            lineHeight: 0.92,
            letterSpacing: -3,
            textTransform: "uppercase",
            color: brand.colors.white,
            opacity: Math.min(1, slam * 1.5),
            transform: `translateY(${(1 - slam) * 90}px) scale(${0.9 + 0.1 * slam})`,
            transformOrigin: "left center",
            overflowWrap: "anywhere",
          }}
        >
          {scene.word}
        </div>
        <div style={{ height: 18, width: 520 * bar, background: brand.colors.red, marginTop: 28 }} />
        {scene.sub && (
          <div
            style={{
              marginTop: 40,
              fontFamily: brand.fonts.body,
              fontWeight: 700,
              fontSize: 60,
              lineHeight: 1.15,
              color: brand.colors.white,
              opacity: sub,
              transform: `translateY(${(1 - sub) * 30}px)`,
              maxWidth: 900,
            }}
          >
            {scene.sub}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
