import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SAFE, type Brand } from "../brand";
import type { SceneOf } from "../schema";
import type { TimedScene } from "../timing";
import { asset, inkShadow, pop, settle, SourceTag, Vignette } from "../components/ui";

const Headline: React.FC<{ brand: Brand; text?: string; label?: string }> = ({ brand, text, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = settle(frame, fps, 8);
  const l = pop(frame, fps, 4);
  return (
    <>
      {label && (
        <div
          style={{
            position: "absolute",
            left: SAFE.side,
            top: SAFE.top + 100,
            padding: "10px 22px",
            background: brand.colors.red,
            color: brand.colors.white,
            fontFamily: brand.fonts.body,
            fontWeight: 900,
            fontSize: 28,
            letterSpacing: 4,
            textTransform: "uppercase",
            borderRadius: 6,
            opacity: Math.min(1, l),
            transform: `scale(${0.9 + 0.1 * l})`,
            transformOrigin: "left center",
          }}
        >
          {label}
        </div>
      )}
      {text && (
        <div
          style={{
            position: "absolute",
            left: SAFE.side,
            right: SAFE.side,
            top: 1150,
            fontFamily: brand.fonts.display,
            fontSize: text.length > 40 ? 64 : 80,
            lineHeight: 1.02,
            textTransform: "uppercase",
            color: brand.colors.white,
            textShadow: inkShadow,
            opacity: s,
            transform: `translateY(${(1 - s) * 30}px)`,
            textWrap: "balance" as never,
          }}
        >
          {text}
        </div>
      )}
    </>
  );
};

export const ImageScene: React.FC<{ scene: SceneOf<"image">; timed: TimedScene; brand: Brand }> = ({ scene, timed, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kb = scene.kenburns ?? "in";
  const t = interpolate(frame, [0, timed.duration], [0, 1], { extrapolateRight: "clamp" });
  const scale = kb === "in" ? 1 + 0.12 * t : kb === "out" ? 1.12 - 0.12 * t : 1.1;
  const x = kb === "left" ? -40 * t + 20 : kb === "right" ? 40 * t - 20 : 0;
  const fade = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  if (!scene.src) {
    // no image yet: a designed plate, caption as the hero — never an empty frame
    const s = settle(frame, fps, 6);
    const text = scene.caption ?? "";
    return (
      <AbsoluteFill style={{ background: brand.colors.ink }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(900px 1100px at 50% 42%, rgba(229,20,42,.42), transparent 70%)`, transform: `scale(${scale})` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 560, height: 6, background: `linear-gradient(90deg, transparent, ${brand.colors.gold}, transparent)`, opacity: 0.8 }} />
        <div
          style={{
            position: "absolute",
            left: SAFE.side,
            right: SAFE.side,
            top: 640,
            fontFamily: brand.fonts.display,
            fontSize: text.length > 40 ? 96 : text.length > 22 ? 120 : 150,
            lineHeight: 0.95,
            textTransform: "uppercase",
            color: brand.colors.white,
            textShadow: inkShadow,
            opacity: s,
            transform: `translateY(${(1 - s) * 40}px)`,
            textWrap: "balance" as never,
          }}
        >
          {text}
        </div>
        <SourceTag brand={brand} text={scene.source} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: brand.colors.ink }}>
      <Img
        src={asset(scene.src)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: scene.fit ?? "cover", transform: `scale(${scale}) translateX(${x}px)`, opacity: fade }}
      />
      <Vignette brand={brand} />
      <Headline brand={brand} text={scene.caption} />
      <SourceTag brand={brand} text={scene.source} />
    </AbsoluteFill>
  );
};

export const FootageScene: React.FC<{ scene: SceneOf<"footage">; brand: Brand }> = ({ scene, brand }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  const muted = scene.muted ?? true;
  return (
    <AbsoluteFill style={{ background: brand.colors.ink }}>
      <OffthreadVideo
        src={asset(scene.src)}
        trimBefore={scene.from != null ? Math.round(scene.from * fps) : undefined}
        trimAfter={scene.to != null ? Math.round(scene.to * fps) : undefined}
        playbackRate={scene.playbackRate}
        muted={muted}
        volume={muted ? 0 : scene.volume ?? 0.6}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: fade }}
      />
      <Vignette brand={brand} top={0.6} bottom={0.85} />
      <Headline brand={brand} text={scene.caption} label={scene.label} />
    </AbsoluteFill>
  );
};
