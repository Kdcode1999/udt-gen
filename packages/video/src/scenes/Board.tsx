import React, { useMemo } from "react";
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SAFE, WIDTH, HEIGHT, type Brand } from "../brand";
import type { SceneOf, BoardStepT } from "../schema";
import type { TimedScene } from "../timing";
import { Accent, asset, inkShadow, pop, ramp, settle } from "../components/ui";

type Pt = { x: number; y: number };
type Ref = string | Pt;

// ---- pitch geometry (frame pixels) --------------------------------------
const FX0 = 50, FX1 = 1030, FY0 = 170, FY1 = 1750;
const px = (x: number) => FX0 + (x / 100) * (FX1 - FX0);
const py = (y: number) => FY0 + (y / 100) * (FY1 - FY0);
const CX = (FX0 + FX1) / 2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const easeInOut = Easing.inOut(Easing.cubic);

const Pitch: React.FC<{ brand: Brand }> = ({ brand }) => {
  const stripes = 14;
  const h = (FY1 - FY0) / stripes;
  const line = brand.colors.pitchLine;
  // penalty areas: 40.3m wide × 16.5m deep; six-yard 18.3m × 5.5m; spot 11m; circle r 9.15m (pitch 68 × 105m)
  const boxW = (40.3 / 68) * (FX1 - FX0), boxD = (16.5 / 105) * (FY1 - FY0);
  const sixW = (18.3 / 68) * (FX1 - FX0), sixD = (5.5 / 105) * (FY1 - FY0);
  const spot = (11 / 105) * (FY1 - FY0);
  const r = (9.15 / 105) * (FY1 - FY0);
  const half = Math.sqrt(Math.max(0, r * r - (boxD - spot) * (boxD - spot)));
  const goalW = (7.32 / 68) * (FX1 - FX0);
  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <radialGradient id="pitchVignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill={brand.colors.pitch} />
      {Array.from({ length: stripes + 4 }, (_, i) => (
        <rect key={i} x={0} y={FY0 - 2 * h + i * h} width={WIDTH} height={h} fill={i % 2 ? brand.colors.pitchAlt : brand.colors.pitch} />
      ))}
      <g fill="none" stroke={line} strokeWidth={4}>
        <rect x={FX0} y={FY0} width={FX1 - FX0} height={FY1 - FY0} />
        <line x1={FX0} y1={py(50)} x2={FX1} y2={py(50)} />
        <circle cx={CX} cy={py(50)} r={r} />
        <rect x={CX - boxW / 2} y={FY0} width={boxW} height={boxD} />
        <rect x={CX - boxW / 2} y={FY1 - boxD} width={boxW} height={boxD} />
        <rect x={CX - sixW / 2} y={FY0} width={sixW} height={sixD} />
        <rect x={CX - sixW / 2} y={FY1 - sixD} width={sixW} height={sixD} />
        <path d={`M ${CX - half} ${FY0 + boxD} A ${r} ${r} 0 0 0 ${CX + half} ${FY0 + boxD}`} />
        <path d={`M ${CX - half} ${FY1 - boxD} A ${r} ${r} 0 0 1 ${CX + half} ${FY1 - boxD}`} />
        <rect x={CX - goalW / 2} y={FY0 - 22} width={goalW} height={22} />
        <rect x={CX - goalW / 2} y={FY1} width={goalW} height={22} />
      </g>
      <g fill={line}>
        <circle cx={CX} cy={py(50)} r={5} />
        <circle cx={CX} cy={FY0 + spot} r={5} />
        <circle cx={CX} cy={FY1 - spot} r={5} />
      </g>
      <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="url(#pitchVignette)" />
    </svg>
  );
};

// ---- arrows ---------------------------------------------------------------
const ARROW_STYLE = {
  pass: { color: "rgba(255,255,255,0.95)", width: 6, dash: "18 14", head: 26 },
  run: { color: "rgba(255,255,255,0.95)", width: 5, dash: undefined, head: 24 },
  key: { color: "#E5142A", width: 10, dash: undefined, head: 36 },
  press: { color: "#E5142A", width: 6, dash: "16 12", head: 26 },
} as const;

const quad = (a: Pt, b: Pt, curve: number) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const c = { x: (a.x + b.x) / 2 + nx * curve * len, y: (a.y + b.y) / 2 + ny * curve * len };
  // sample length
  let L = 0, prev = a;
  for (let i = 1; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    const p = { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
    L += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  const ang = Math.atan2(b.y - c.y, b.x - c.x);
  return { d: `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`, length: L, angle: ang };
};

const Arrow: React.FC<{ id: string; a: Pt; b: Pt; style: keyof typeof ARROW_STYLE; curve: number; progress: number; opacity: number }> = ({ id, a, b, style, curve, progress, opacity }) => {
  const st = ARROW_STYLE[style];
  // shorten so the head sits on the target edge rather than its centre
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const trim = 38;
  const b2 = { x: b.x - (dx / len) * trim, y: b.y - (dy / len) * trim };
  const a2 = { x: a.x + (dx / len) * 34, y: a.y + (dy / len) * 34 };
  const q = quad(a2, b2, curve);
  const headO = interpolate(progress, [0.82, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const h = st.head;
  return (
    <g opacity={opacity}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={WIDTH} height={HEIGHT}>
          <path d={q.d} fill="none" stroke="#fff" strokeWidth={st.width + 30} strokeLinecap="round" strokeDasharray={q.length} strokeDashoffset={q.length * (1 - progress)} />
        </mask>
      </defs>
      <path d={q.d} fill="none" stroke="rgba(10,10,12,0.55)" strokeWidth={st.width + 6} strokeLinecap="round" strokeDasharray={st.dash} mask={`url(#${id})`} />
      <path d={q.d} fill="none" stroke={st.color} strokeWidth={st.width} strokeLinecap="round" strokeDasharray={st.dash} mask={`url(#${id})`} />
      <g transform={`translate(${b2.x} ${b2.y}) rotate(${(q.angle * 180) / Math.PI})`} opacity={headO}>
        <polygon points={`${h * 0.9},0 ${-h * 0.35},${-h * 0.55} ${-h * 0.35},${h * 0.55}`} fill={st.color} stroke="rgba(10,10,12,0.55)" strokeWidth={3} strokeLinejoin="round" />
      </g>
    </g>
  );
};

// ---- the scene ------------------------------------------------------------
export const Board: React.FC<{ scene: SceneOf<"board">; timed: TimedScene; brand: Brand }> = ({ scene, timed, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = scene.steps;
  const n = steps.length;
  const homeColor = scene.homeColor ?? brand.colors.red;
  const awayColor = scene.awayColor ?? brand.colors.away;

  const model = useMemo(() => {
    const durSec = timed.duration / fps;
    const lead = 0.4, tail = 0.6;
    const starts = steps.map((s, i) => Math.round(((s.at ?? lead + (i * (durSec - lead - tail)) / n)) * fps));
    for (let i = 1; i < starts.length; i++) starts[i] = Math.max(starts[i], starts[i - 1] + 1);
    const base: Record<string, Pt> = Object.fromEntries(scene.players.map((p) => [p.id, { x: p.x, y: p.y }]));
    const posAt: Record<string, Pt>[] = [];
    const ballAt: (Pt | undefined)[] = [];
    const zoomAt: { x: number; y: number; scale: number }[] = [];
    const labelAt: { text: string; since: number }[] = [];
    let cur = base, ball = scene.ball, zoom = { x: 50, y: 50, scale: 1 };
    let label = scene.title ? { text: scene.title, since: 0 } : { text: "", since: 0 };
    steps.forEach((s, i) => {
      cur = { ...cur, ...(s.players ?? {}) };
      posAt.push(cur);
      if (s.ball) ball = s.ball;
      ballAt.push(ball);
      if (s.zoom) zoom = s.zoom;
      zoomAt.push(zoom);
      if (s.label) label = { text: s.label, since: starts[i] };
      labelAt.push(label);
    });
    return { starts, base, posAt, ballAt, zoomAt, labelAt, baseBall: scene.ball };
  }, [scene, steps, n, timed.duration, fps]);

  const { starts } = model;
  let k = -1;
  for (let i = 0; i < n; i++) if (frame >= starts[i]) k = i;
  const lf = k >= 0 ? frame - starts[k] : frame;
  const move = k >= 0 ? ramp(lf, 0, 20, easeInOut) : 1;

  const prevPos = k <= 0 ? model.base : model.posAt[k - 1];
  const curPos = k < 0 ? model.base : model.posAt[k];
  const posOf = (id: string): Pt => {
    const a = prevPos[id] ?? model.base[id], b = curPos[id] ?? model.base[id];
    return lerpPt(a, b, move);
  };
  const pixel = (r: Ref): Pt => {
    const p = typeof r === "string" ? posOf(r) : r;
    return { x: px(p.x), y: py(p.y) };
  };

  // camera
  const zPrev = k <= 0 ? { x: 50, y: 50, scale: 1 } : model.zoomAt[k - 1];
  const zCur = k < 0 ? { x: 50, y: 50, scale: 1 } : model.zoomAt[k];
  const zt = k >= 0 ? ramp(lf, 0, 28, easeInOut) : 1;
  const fx = px(lerp(zPrev.x, zCur.x, zt)), fy = py(lerp(zPrev.y, zCur.y, zt)), zs = lerp(zPrev.scale, zCur.scale, zt);
  const centering = 0.7;
  const camera = `translate(${(WIDTH / 2 - fx) * centering * (zs - 1)}px, ${(HEIGHT / 2 - fy) * centering * (zs - 1)}px) scale(${zs})`;

  // ball
  const ballPrev = k <= 0 ? model.baseBall : model.ballAt[k - 1];
  const ballCur = k < 0 ? model.baseBall : model.ballAt[k];
  const ballPos = ballCur ? (ballPrev ? lerpPt(ballPrev, ballCur, move) : ballCur) : undefined;

  const renderStep = (s: BoardStepT | undefined, idx: number, local: number, fade: number) => {
    if (!s) return null;
    const els: React.ReactNode[] = [];
    if (s.zone) {
      const z = s.zone;
      const t = pop(local, fps, 6);
      els.push(
        <g key="zone" opacity={fade} transform={`translate(${px(z.x)} ${py(z.y)}) scale(${0.6 + 0.4 * t})`}>
          <ellipse cx={0} cy={0} rx={z.rx * 9.8} ry={z.ry * 15.8} fill="rgba(244,192,78,0.18)" stroke={brand.colors.gold} strokeWidth={4} strokeDasharray="12 10" />
          {z.label && (
            <text x={0} y={10} textAnchor="middle" fontFamily={brand.fonts.body} fontWeight={900} fontSize={28} fill={brand.colors.gold} style={{ paintOrder: "stroke" }} stroke="rgba(10,10,12,0.8)" strokeWidth={6} letterSpacing={2}>
              {z.label.toUpperCase()}
            </text>
          )}
        </g>,
      );
    }
    (s.lines ?? []).forEach((l, i) => {
      const a = pixel(l.from), b = pixel(l.to);
      const prog = ramp(local, 6 + i * 3, 14);
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const pa = scene.players.find((p) => p.id === l.from)?.team, pb = scene.players.find((p) => p.id === l.to)?.team;
      const color = l.color ?? (pa === "home" && pb === "home" ? "red" : "white");
      const stroke = color === "red" ? "rgba(229,20,42,0.85)" : color === "gold" ? brand.colors.gold : "rgba(255,255,255,0.85)";
      els.push(<line key={`l${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={7} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - prog)} opacity={fade} />);
    });
    (s.arrows ?? []).forEach((ar, i) => {
      const prog = ramp(local, 12 + i * 9, 20);
      els.push(<Arrow key={`a${i}`} id={`arr-${idx}-${i}`} a={pixel(ar.from)} b={pixel(ar.to)} style={ar.style ?? "pass"} curve={ar.curve ?? 0.16} progress={prog} opacity={fade} />);
    });
    (s.highlight ?? []).forEach((id, i) => {
      const p = pixel(id);
      const t = pop(local, fps, 8 + i * 4);
      const pulse = 1 + 0.05 * Math.sin((local - 8) / 5);
      els.push(<circle key={`h${i}`} cx={p.x} cy={p.y} r={48 * (1.8 - 0.8 * t) * pulse} fill="none" stroke={brand.colors.gold} strokeWidth={6} opacity={fade * Math.min(1, t)} />);
    });
    return <g key={`step${idx}`}>{els}</g>;
  };

  const label = k < 0 ? (scene.title ? { text: scene.title, since: 0 } : null) : model.labelAt[k];
  const labelS = label ? pop(frame, fps, label.since + 3) : 0;
  const labelSize = label ? (label.text.length > 18 ? 78 : label.text.length > 12 ? 96 : 118) : 0;

  const card = scene.card;
  const cardS = settle(frame, fps, 6);
  const cardLeft = (card?.side ?? "left") === "left";

  return (
    <AbsoluteFill style={{ background: brand.colors.pitch, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: camera, transformOrigin: `${fx}px ${fy}px` }}>
        <Pitch brand={brand} />
        <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <filter id="markerShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0A0A0C" floodOpacity="0.55" />
            </filter>
          </defs>
          {k >= 1 && renderStep(steps[k - 1], k - 1, 999, 1 - ramp(lf, 0, 8))}
          {k >= 0 && renderStep(steps[k], k, lf, 1)}
          {scene.players.map((p, i) => {
            const pos = posOf(p.id);
            const X = px(pos.x), Y = py(pos.y);
            const t = pop(frame, fps, 2 + i * 1.5);
            const fill = p.team === "home" ? homeColor : awayColor;
            return (
              <g key={p.id} transform={`translate(${X} ${Y}) scale(${Math.max(0, t)})`} filter="url(#markerShadow)">
                <circle r={30} fill={fill} stroke="#0A0A0C" strokeWidth={4} />
                <circle r={26} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
                {p.number != null && (
                  <text y={10} textAnchor="middle" fontFamily={brand.fonts.display} fontSize={28} fill="#0A0A0C">
                    {p.number}
                  </text>
                )}
                {p.name && (
                  <text y={66} textAnchor="middle" fontFamily={brand.fonts.body} fontWeight={700} fontSize={26} letterSpacing={1.5} fill="#F6F6F4" stroke="#0A0A0C" strokeWidth={6} style={{ paintOrder: "stroke" }}>
                    {p.name.toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}
          {ballPos && (
            <g transform={`translate(${px(ballPos.x)} ${py(ballPos.y)})`} filter="url(#markerShadow)">
              <circle r={15} fill={brand.colors.gold} stroke="#0A0A0C" strokeWidth={4} />
              <circle r={6} cx={-4} cy={-4} fill="rgba(255,255,255,0.55)" />
            </g>
          )}
        </svg>
      </div>

      {/* legibility bands for the tag/label (top) and captions (bottom) */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(10,10,12,.72) 0%, rgba(10,10,12,.35) 14%, rgba(10,10,12,0) 26%)" }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(0deg, rgba(10,10,12,.7) 0%, rgba(10,10,12,.25) 16%, rgba(10,10,12,0) 30%)" }} />

      {/* step label (unzoomed) */}
      {label && label.text && (
        <div
          style={{
            position: "absolute",
            left: SAFE.side,
            right: SAFE.side,
            top: SAFE.top + 96,
            textAlign: "center",
            fontFamily: brand.fonts.display,
            fontSize: labelSize,
            lineHeight: 1,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: brand.colors.white,
            textShadow: inkShadow,
            opacity: Math.min(1, labelS),
            transform: `translateY(${(1 - labelS) * 30}px) scale(${0.9 + 0.1 * labelS})`,
          }}
        >
          <Accent text={label.text} color={brand.colors.gold} />
        </div>
      )}

      {/* player card (unzoomed) */}
      {card && (
        <div
          style={{
            position: "absolute",
            left: cardLeft ? SAFE.side : undefined,
            right: cardLeft ? undefined : SAFE.side,
            top: SAFE.top + 230,
            width: 250,
            padding: 12,
            background: "#EFE9DA",
            borderRadius: 10,
            boxShadow: "0 18px 40px rgba(10,10,12,.5)",
            transform: `translateX(${(1 - cardS) * (cardLeft ? -360 : 360)}px) rotate(${cardLeft ? -6 : 6}deg)`,
            opacity: Math.min(1, cardS * 1.4),
          }}
        >
          <div style={{ width: 226, height: 250, borderRadius: 6, overflow: "hidden", background: "#DED7C4", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {card.img ? (
              <Img src={asset(card.img)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(1.15) sepia(0.25)" }} />
            ) : (
              <div style={{ fontFamily: brand.fonts.display, fontSize: 120, color: "#1E1E22", lineHeight: 1 }}>
                {card.name
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ marginTop: 10, background: brand.colors.gold, color: brand.colors.ink, borderRadius: 999, padding: "8px 14px", textAlign: "center", fontFamily: brand.fonts.display, fontSize: 30, letterSpacing: 1, textTransform: "uppercase", lineHeight: 1 }}>
            {card.name}
          </div>
          {card.sub && (
            <div style={{ marginTop: 6, textAlign: "center", fontFamily: brand.fonts.body, fontWeight: 700, fontSize: 20, color: "#4B4A52", letterSpacing: 1.5, textTransform: "uppercase" }}>{card.sub}</div>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};
