import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SAFE, type Brand } from "../brand";
import type { SceneOf } from "../schema";
import { Glow, pop, settle, SourceTag } from "../components/ui";

const fmt = (v: number, decimals = 0) =>
  v.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const Stat: React.FC<{ scene: SceneOf<"stat">; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = pop(frame, fps, 6);
  const ctx = settle(frame, fps, 0);
  const count = interpolate(frame, [10, 10 + fps * 1.1], [0, scene.value], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const gold = scene.gold ?? false;
  const bg = gold ? brand.colors.gold : brand.colors.surface;
  const fg = gold ? brand.colors.ink : brand.colors.white;
  const numColor = gold ? brand.colors.ink : brand.colors.red;
  const digits = `${scene.prefix ?? ""}${fmt(scene.value, scene.decimals)}${scene.suffix ?? ""}`;
  const numSize = digits.length <= 3 ? 300 : digits.length <= 5 ? 240 : digits.length <= 7 ? 190 : 150;

  return (
    <AbsoluteFill style={{ background: brand.colors.ink }}>
      <Glow brand={brand} y={1100} strength={gold ? 0.25 : 0.4} />
      {scene.context && (
        <div
          style={{
            position: "absolute",
            left: SAFE.side,
            right: SAFE.side,
            top: 560,
            fontFamily: brand.fonts.body,
            fontWeight: 700,
            fontSize: 54,
            lineHeight: 1.15,
            color: brand.colors.white,
            opacity: ctx,
            transform: `translateY(${(1 - ctx) * 24}px)`,
          }}
        >
          {scene.context}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: SAFE.side,
          right: SAFE.side,
          top: 800,
          padding: "52px 56px 48px",
          borderRadius: 30,
          background: bg,
          color: fg,
          boxShadow: gold ? `0 30px 80px rgba(244,192,78,.25)` : `0 30px 80px rgba(0,0,0,.5)`,
          opacity: Math.min(1, card * 1.3),
          transform: `translateY(${(1 - card) * 80}px) scale(${0.94 + 0.06 * card})`,
          borderLeft: gold ? undefined : `14px solid ${brand.colors.red}`,
        }}
      >
        <div style={{ fontFamily: brand.fonts.display, fontSize: numSize, lineHeight: 1, color: numColor, fontVariantNumeric: "tabular-nums" }}>
          {scene.prefix ?? ""}
          {fmt(count, scene.decimals)}
          {scene.suffix ?? ""}
        </div>
        <div style={{ marginTop: 10, fontFamily: brand.fonts.body, fontWeight: 900, fontSize: 44, letterSpacing: 5, textTransform: "uppercase", opacity: 0.92 }}>{scene.label}</div>
      </div>
      <SourceTag brand={brand} text={scene.source} />
    </AbsoluteFill>
  );
};
