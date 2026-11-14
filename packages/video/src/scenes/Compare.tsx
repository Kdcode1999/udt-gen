import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { SAFE, type Brand } from "../brand";
import type { SceneOf } from "../schema";
import { pop, ramp, settle, SourceTag } from "../components/ui";

export const Compare: React.FC<{ scene: SceneOf<"compare">; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = settle(frame, fps, 0);
  const title = pop(frame, fps, 2);
  const leftColor = brand.colors.red;
  const rightColor = brand.colors.away;
  const rowTop = scene.title ? 760 : 660;
  const rowH = 150;
  const maxBar = 400;

  return (
    <AbsoluteFill style={{ background: brand.colors.ink }}>
      {scene.title && (
        <div
          style={{
            position: "absolute",
            left: SAFE.side,
            right: SAFE.side,
            top: 400,
            textAlign: "center",
            fontFamily: brand.fonts.display,
            fontSize: 96,
            lineHeight: 1,
            textTransform: "uppercase",
            color: brand.colors.white,
            opacity: Math.min(1, title),
            transform: `scale(${0.9 + 0.1 * title})`,
          }}
        >
          {scene.title}
        </div>
      )}
      {/* heads */}
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: rowTop - 170, display: "flex", justifyContent: "space-between", opacity: head, transform: `translateY(${(1 - head) * 20}px)` }}>
        {[
          { side: scene.left, color: leftColor, align: "left" as const },
          { side: scene.right, color: rightColor, align: "right" as const },
        ].map((h, i) => (
          <div key={i} style={{ textAlign: h.align, maxWidth: 440 }}>
            <div style={{ fontFamily: brand.fonts.display, fontSize: 64, lineHeight: 1, textTransform: "uppercase", color: brand.colors.white }}>{h.side.name}</div>
            {h.side.sub && <div style={{ marginTop: 8, fontFamily: brand.fonts.body, fontWeight: 700, fontSize: 26, letterSpacing: 2, textTransform: "uppercase", color: brand.colors.muted }}>{h.side.sub}</div>}
            <div style={{ marginTop: 14, height: 10, width: 160, background: h.color, marginLeft: h.align === "right" ? "auto" : 0 }} />
          </div>
        ))}
      </div>
      {/* rows */}
      {scene.rows.map((r, i) => {
        const delay = 10 + i * 7;
        const grow = ramp(frame, delay, 22);
        const fade = settle(frame, fps, delay);
        const max = Math.max(r.left, r.right, 1e-9);
        const lw = (r.left / max) * maxBar * grow;
        const rw = (r.right / max) * maxBar * grow;
        const leftWins = r.lowerIsBetter ? r.left < r.right : r.left > r.right;
        const rightWins = r.lowerIsBetter ? r.right < r.left : r.right > r.left;
        const y = rowTop + i * rowH;
        return (
          <div key={i} style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: y, height: rowH, opacity: fade }}>
            <div style={{ textAlign: "center", fontFamily: brand.fonts.body, fontWeight: 700, fontSize: 30, letterSpacing: 3, textTransform: "uppercase", color: brand.colors.muted }}>{r.label}</div>
            <div style={{ position: "relative", height: 70, marginTop: 14 }}>
              {/* centre gap 40px: bars grow outward */}
              <div style={{ position: "absolute", right: "50%", marginRight: 20, top: 16, height: 38, width: lw, background: leftColor, opacity: leftWins ? 1 : 0.45, borderRadius: "8px 0 0 8px" }} />
              <div style={{ position: "absolute", left: "50%", marginLeft: 20, top: 16, height: 38, width: rw, background: rightColor, opacity: rightWins ? 1 : 0.45, borderRadius: "0 8px 8px 0" }} />
              <div style={{ position: "absolute", left: 0, top: 0, fontFamily: brand.fonts.display, fontSize: 66, lineHeight: "70px", color: leftWins ? brand.colors.gold : brand.colors.white, fontVariantNumeric: "tabular-nums" }}>{r.leftLabel ?? r.left}</div>
              <div style={{ position: "absolute", right: 0, top: 0, fontFamily: brand.fonts.display, fontSize: 66, lineHeight: "70px", color: rightWins ? brand.colors.gold : brand.colors.white, fontVariantNumeric: "tabular-nums" }}>{r.rightLabel ?? r.right}</div>
            </div>
          </div>
        );
      })}
      <SourceTag brand={brand} text={scene.source} />
    </AbsoluteFill>
  );
};
