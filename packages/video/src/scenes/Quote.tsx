import React from "react";
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from "remotion";
import { SAFE, type Brand } from "../brand";
import type { SceneOf } from "../schema";
import type { TimedScene } from "../timing";
import { Backdrop } from "../components/Backdrop";
import { asset, Glow, ramp, settle } from "../components/ui";

export const Quote: React.FC<{ scene: SceneOf<"quote">; timed: TimedScene; brand: Brand }> = ({ scene, timed, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = ramp(frame, 0, 18);
  const text = settle(frame, fps, 6);
  const who = settle(frame, fps, 18);
  const len = scene.text.length;
  const size = len > 230 ? 44 : len > 150 ? 52 : len > 90 ? 60 : 70;

  return (
    <AbsoluteFill style={{ background: brand.colors.ink }}>
      {scene.visuals?.length ? <Backdrop visuals={scene.visuals} words={timed.words} duration={timed.duration} fps={fps} brand={brand} /> : null}
      <Glow brand={brand} x={200} y={700} size={1200} strength={0.3} />
      <div
        style={{
          position: "absolute",
          left: SAFE.side - 10,
          top: 430,
          fontFamily: brand.fonts.display,
          fontSize: 420,
          lineHeight: 0.7,
          color: brand.colors.red,
          opacity: 0.9 * mark,
          transform: `translateY(${(1 - mark) * -30}px)`,
        }}
      >
        “
      </div>
      <div
        style={{
          position: "absolute",
          left: SAFE.side,
          right: SAFE.side,
          top: 700,
          fontFamily: brand.fonts.body,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.22,
          color: brand.colors.white,
          textShadow: scene.visuals?.length ? "0 2px 14px rgba(10,10,12,.9)" : undefined,
          opacity: text,
          transform: `translateY(${(1 - text) * 30}px)`,
          textWrap: "balance" as never,
        }}
      >
        {scene.text}
      </div>
      <div
        style={{
          position: "absolute",
          left: SAFE.side,
          right: SAFE.side,
          top: 1230,
          display: "flex",
          alignItems: "center",
          gap: 24,
          opacity: who,
          transform: `translateY(${(1 - who) * 24}px)`,
        }}
      >
        {scene.img ? (
          <Img src={asset(scene.img)} style={{ width: 110, height: 110, borderRadius: 55, objectFit: "cover", border: `4px solid ${brand.colors.gold}` }} />
        ) : (
          <div style={{ width: 80, height: 10, background: brand.colors.gold }} />
        )}
        <div>
          <div style={{ fontFamily: brand.fonts.display, fontSize: 60, lineHeight: 1, color: brand.colors.white, letterSpacing: 1, textTransform: "uppercase" }}>{scene.who}</div>
          {scene.source && (
            <div style={{ marginTop: 10, fontFamily: brand.fonts.body, fontWeight: 700, fontSize: 28, letterSpacing: 2, textTransform: "uppercase", color: brand.colors.gold }}>{scene.source}</div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
