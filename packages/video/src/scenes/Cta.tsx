import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { SAFE, type Brand } from "../brand";
import type { SceneOf } from "../schema";
import { Glow, pop, settle } from "../components/ui";

const Icon: React.FC<{ d: string; color: string }> = ({ d, color }) => (
  <svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export const Cta: React.FC<{ scene: SceneOf<"cta">; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mark = pop(frame, fps, 2);
  const line = settle(frame, fps, 12);
  const btn = pop(frame, fps, 22);
  const pulse = 1 + 0.03 * Math.sin(frame / 6);
  const icons = settle(frame, fps, 30);

  return (
    <AbsoluteFill style={{ background: brand.colors.ink }}>
      <Glow brand={brand} y={760} strength={0.5} />
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: 620, textAlign: "center" }}>
        <div style={{ fontFamily: brand.fonts.display, fontSize: 150, lineHeight: 0.95, textTransform: "uppercase", color: brand.colors.white, opacity: Math.min(1, mark), transform: `scale(${0.9 + 0.1 * mark})` }}>
          <div>{brand.wordmark[0]}</div>
          <div style={{ color: brand.colors.red }}>{brand.wordmark[1]}</div>
        </div>
        <div style={{ marginTop: 44, fontFamily: brand.fonts.body, fontWeight: 700, fontSize: 52, lineHeight: 1.2, color: brand.colors.white, opacity: line, transform: `translateY(${(1 - line) * 24}px)` }}>
          {scene.line ?? "Follow for the full breakdown"}
        </div>
        <div
          style={{
            display: "inline-block",
            marginTop: 54,
            padding: "26px 72px",
            borderRadius: 999,
            background: brand.colors.red,
            color: brand.colors.white,
            fontFamily: brand.fonts.body,
            fontWeight: 900,
            fontSize: 44,
            letterSpacing: 4,
            textTransform: "uppercase",
            boxShadow: `0 20px 60px rgba(229,20,42,.45)`,
            opacity: Math.min(1, btn),
            transform: `scale(${(0.8 + 0.2 * btn) * pulse})`,
          }}
        >
          Follow
        </div>
        <div style={{ marginTop: 48, display: "flex", justifyContent: "center", gap: 70, opacity: icons }}>
          <Icon color={brand.colors.white} d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
          <Icon color={brand.colors.white} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <Icon color={brand.colors.white} d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
        </div>
        <div style={{ marginTop: 30, fontFamily: brand.fonts.body, fontWeight: 700, fontSize: 28, letterSpacing: 3, textTransform: "uppercase", color: brand.colors.muted, opacity: icons }}>
          {scene.sub ?? `${brand.handle} · Reels · TikTok · Shorts`}
        </div>
      </div>
    </AbsoluteFill>
  );
};
