import React from "react";
import { AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { SAFE, type Brand } from "../brand";

/**
 * Base URL for per-video files. Empty = Remotion's public dir (Studio / CLI render).
 * The web app sets it (e.g. "/api/videos/demo/file") so the Player can load the same
 * assets/ and vo/ paths through its own routes.
 */
let assetBase = "";
export const setAssetBase = (base: string) => {
  assetBase = base.replace(/\/$/, "");
};

/** Resolve an asset path from script.json: absolute URLs pass through, everything else is a video-dir file. */
export const asset = (p: string): string => {
  if (/^(https?:|data:|blob:)/.test(p)) return p;
  if (assetBase) return `${assetBase}/${p.split("/").map(encodeURIComponent).join("/")}`;
  return staticFile(p);
};

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Eased 0→1 over [from, from+len] frames. */
export const ramp = (frame: number, from: number, len: number, easing = Easing.out(Easing.cubic)) =>
  interpolate(frame, [from, from + len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/** Snappy pop-in spring (overshoots a touch). */
export const pop = (frame: number, fps: number, delay = 0) =>
  spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 170, mass: 0.8 } });

/** Smooth settle spring, no overshoot. */
export const settle = (frame: number, fps: number, delay = 0) =>
  spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 120, mass: 1 } });

/** Text with *gold* spans: "THE *MID-BLOCK*" */
export const Accent: React.FC<{ text: string; color: string }> = ({ text, color }) => {
  const parts = text.split("*");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} style={i % 2 === 1 ? { color } : undefined}>
          {p}
        </span>
      ))}
    </>
  );
};

export const inkShadow = "0 4px 0 rgba(10,10,12,.9), 0 0 24px rgba(10,10,12,.55)";

/** Page tag (top-left pill) + wordmark (top-right). Sits just inside the top safe zone. */
export const Tag: React.FC<{ brand: Brand; series?: string }> = ({ brand, series }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = settle(frame, fps, 2);
  const y = SAFE.top + 16;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: SAFE.side,
          top: y,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 24px 12px 18px",
          borderRadius: 999,
          background: "rgba(10,10,12,0.62)",
          border: "2px solid rgba(255,255,255,0.28)",
          fontFamily: brand.fonts.body,
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: brand.colors.white,
          opacity: s,
          transform: `translateY(${(1 - s) * -20}px)`,
        }}
      >
        <span style={{ width: 14, height: 14, borderRadius: 7, background: brand.colors.gold, boxShadow: `0 0 14px ${brand.colors.gold}` }} />
        {series ?? brand.name}
      </div>
      <div
        style={{
          position: "absolute",
          right: SAFE.side,
          top: y - 2,
          fontFamily: brand.fonts.display,
          fontSize: 44,
          lineHeight: 1,
          letterSpacing: 1,
          color: brand.colors.white,
          textShadow: inkShadow,
          opacity: s,
          display: "flex",
          gap: 12,
        }}
      >
        <span>{brand.wordmark[0]}</span>
        <span style={{ color: brand.colors.red }}>{brand.wordmark[1]}</span>
      </div>
    </>
  );
};

/** Debug overlay for the Master Spec safe zones. Enabled with "debug": true in script.json. */
export const SafeZone: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <div style={{ position: "absolute", left: SAFE.x0, top: SAFE.y0, width: SAFE.x1 - SAFE.x0, height: SAFE.y1 - SAFE.y0, border: "3px dashed rgba(229,20,42,.8)" }} />
    <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: SAFE.top, background: "rgba(229,20,42,.12)" }} />
    <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: SAFE.bottom, background: "rgba(229,20,42,.12)" }} />
  </AbsoluteFill>
);

/** Soft red glow used behind hero text. */
export const Glow: React.FC<{ brand: Brand; x?: number; y?: number; size?: number; strength?: number }> = ({ brand, x = 540, y = 900, size = 1500, strength = 0.42 }) => {
  const frame = useCurrentFrame();
  const o = ramp(frame, 0, 24) * strength;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(closest-side, ${brand.colors.red}, transparent 70%)`,
        opacity: o,
        filter: "blur(10px)",
      }}
    />
  );
};

/** Dark gradient bands top and bottom for legibility over photos and footage. */
export const Vignette: React.FC<{ brand: Brand; top?: number; bottom?: number }> = ({ brand, top = 0.75, bottom = 0.9 }) => (
  <>
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(10,10,12,${top}) 0%, rgba(10,10,12,0) 32%)` }} />
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, rgba(10,10,12,${bottom}) 0%, rgba(10,10,12,0) 45%)` }} />
    <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 220px rgba(10,10,12,.55)` }} />
    <span style={{ display: "none" }}>{brand.id}</span>
  </>
);

/** Small source attribution, bottom-right inside the safe zone. */
export const SourceTag: React.FC<{ brand: Brand; text?: string }> = ({ brand, text }) => {
  if (!text) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: SAFE.side,
        top: SAFE.y1 - 40,
        fontFamily: brand.fonts.body,
        fontWeight: 500,
        fontSize: 24,
        color: brand.colors.muted,
        letterSpacing: 0.5,
        textShadow: "0 2px 8px rgba(10,10,12,.9)",
      }}
    >
      {text}
    </div>
  );
};

export const clampFrames = clamp01;
