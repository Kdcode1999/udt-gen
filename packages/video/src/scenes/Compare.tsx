import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { SAFE, type Brand } from "../brand";
import type { SceneOf } from "../schema";
import { pop, ramp, settle, SourceTag } from "../components/ui";

const NUM_COL = 150; // fixed number columns so bars can never run under the digits
const GAP = 22;
const ROW_H = 150;

const decimalsOf = (n: number) => {
  const s = String(n);
  const i = s.indexOf(".");
  return i < 0 ? 0 : Math.min(2, s.length - i - 1);
};

export const Compare: React.FC<{ scene: SceneOf<"compare">; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = settle(frame, fps, 0);
  const title = pop(frame, fps, 2);
  const leftColor = brand.colors.red;
  const rightColor = brand.colors.away;

  // vertical layout: centre the whole block in the safe area
  const titleH = scene.title ? 96 + 56 : 0;
  const headH = 150;
  const blockH = titleH + headH + scene.rows.length * ROW_H;
  const centre = (SAFE.y0 + 1380) / 2; // keep clear of the caption band at ~1440
  const top = Math.max(SAFE.y0 + 120, Math.round(centre - blockH / 2));
  const headTop = top + titleH;
  const rowTop = headTop + headH;

  const width = SAFE.x1 - SAFE.x0;
  const barArea = (width - NUM_COL * 2 - GAP * 3) / 2;

  return (
    <AbsoluteFill style={{ background: brand.colors.ink }}>
      {scene.title && (
        <div
          style={{
            position: "absolute",
            left: SAFE.side,
            right: SAFE.side,
            top,
            textAlign: "center",
            fontFamily: brand.fonts.display,
            fontSize: scene.title.length > 18 ? 78 : 96,
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
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: headTop, display: "flex", justifyContent: "space-between", opacity: head, transform: `translateY(${(1 - head) * 20}px)` }}>
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
        const max = Math.max(Math.abs(r.left), Math.abs(r.right), 1e-9);
        const lw = (Math.abs(r.left) / max) * barArea * grow;
        const rw = (Math.abs(r.right) / max) * barArea * grow;
        const leftWins = r.lowerIsBetter ? r.left < r.right : r.left > r.right;
        const rightWins = r.lowerIsBetter ? r.right < r.left : r.right > r.left;
        const dec = Math.max(decimalsOf(r.left), decimalsOf(r.right));
        const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: dec, maximumFractionDigits: dec });
        const lText = r.leftLabel ?? fmt(r.left);
        const rText = r.rightLabel ?? fmt(r.right);
        const numSize = (t: string) => (t.length > 6 ? 44 : t.length > 4 ? 54 : 66);
        const y = rowTop + i * ROW_H;
        return (
          <div key={i} style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: y, height: ROW_H, opacity: fade }}>
            <div style={{ textAlign: "center", fontFamily: brand.fonts.body, fontWeight: 700, fontSize: 30, letterSpacing: 3, textTransform: "uppercase", color: brand.colors.muted }}>{r.label}</div>
            <div
              style={{
                marginTop: 14,
                height: 70,
                display: "grid",
                gridTemplateColumns: `${NUM_COL}px ${barArea}px ${barArea}px ${NUM_COL}px`,
                columnGap: GAP,
                alignItems: "center",
              }}
            >
              <div style={{ textAlign: "right", fontFamily: brand.fonts.display, fontSize: numSize(lText), lineHeight: 1, color: leftWins ? brand.colors.gold : brand.colors.white, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{lText}</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ height: 38, width: lw, background: leftColor, opacity: leftWins ? 1 : 0.45, borderRadius: "8px 0 0 8px" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ height: 38, width: rw, background: rightColor, opacity: rightWins ? 1 : 0.45, borderRadius: "0 8px 8px 0" }} />
              </div>
              <div style={{ textAlign: "left", fontFamily: brand.fonts.display, fontSize: numSize(rText), lineHeight: 1, color: rightWins ? brand.colors.gold : brand.colors.white, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{rText}</div>
            </div>
          </div>
        );
      })}
      <SourceTag brand={brand} text={scene.source} />
    </AbsoluteFill>
  );
};
