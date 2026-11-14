"use client";
import React, { useMemo, useState } from "react";
import type { SceneOf } from "@utd/video";
import { Check, Num, Row, Select, Text } from "./fields";
import { AssetPicker, type AssetInfo } from "./AssetPicker";

type Board = SceneOf<"board">;
type Step = Board["steps"][number];
type Pt = { x: number; y: number };
type Target = { kind: "base"; id: string } | { kind: "move"; step: number; id: string } | { kind: "ball"; step: number | null } | { kind: "arrow"; step: number; i: number; end: "from" | "to" } | { kind: "zone"; step: number } | null;

const PRESETS: Record<string, Record<string, Pt>> = {
  "4-2-3-1": { gk: { x: 50, y: 94 }, lb: { x: 15, y: 78 }, lcb: { x: 37, y: 80 }, rcb: { x: 63, y: 80 }, rb: { x: 85, y: 78 }, dm1: { x: 38, y: 66 }, dm2: { x: 62, y: 66 }, lw: { x: 18, y: 52 }, am: { x: 50, y: 54 }, rw: { x: 82, y: 52 }, st: { x: 50, y: 40 } },
  "4-3-3": { gk: { x: 50, y: 94 }, lb: { x: 15, y: 78 }, lcb: { x: 37, y: 80 }, rcb: { x: 63, y: 80 }, rb: { x: 85, y: 78 }, cm: { x: 50, y: 68 }, lcm: { x: 32, y: 62 }, rcm: { x: 68, y: 62 }, lw: { x: 18, y: 48 }, st: { x: 50, y: 42 }, rw: { x: 82, y: 48 } },
  "3-4-3": { gk: { x: 50, y: 94 }, lcb: { x: 28, y: 80 }, cb: { x: 50, y: 82 }, rcb: { x: 72, y: 80 }, lwb: { x: 10, y: 64 }, cm1: { x: 38, y: 66 }, cm2: { x: 62, y: 66 }, rwb: { x: 90, y: 64 }, lw: { x: 25, y: 48 }, st: { x: 50, y: 42 }, rw: { x: 75, y: 48 } },
  "4-4-2": { gk: { x: 50, y: 94 }, lb: { x: 15, y: 78 }, lcb: { x: 37, y: 80 }, rcb: { x: 63, y: 80 }, rb: { x: 85, y: 78 }, lm: { x: 15, y: 60 }, lcm: { x: 38, y: 64 }, rcm: { x: 62, y: 64 }, rm: { x: 85, y: 60 }, st1: { x: 40, y: 44 }, st2: { x: 60, y: 44 } },
};

const preset = (team: "home" | "away", name: string): Board["players"] =>
  Object.entries(PRESETS[name]).map(([k, p]) => ({
    id: `${team === "home" ? "h" : "a"}_${k}`,
    team,
    x: team === "home" ? p.x : 100 - p.x,
    y: team === "home" ? p.y : 100 - p.y,
  }));

const ARROW_STYLES = ["pass", "run", "key", "press"].map((v) => ({ value: v, label: v }));
const LINE_COLORS = ["red", "white", "gold"].map((v) => ({ value: v, label: v }));

export const BoardEditor: React.FC<{ slug: string; scene: Board; assets: AssetInfo[]; onAssets: (a: AssetInfo[]) => void; onChange: (s: Board) => void }> = ({ slug, scene, assets, onAssets, onChange }) => {
  const [stepIdx, setStepIdx] = useState<number | null>(scene.steps.length ? 0 : null);
  const [target, setTarget] = useState<Target>(null);
  const [json, setJson] = useState<string | null>(null);
  const [jsonErr, setJsonErr] = useState("");

  const set = (patch: Partial<Board>) => onChange({ ...scene, ...patch });
  const setStep = (i: number, patch: Partial<Step>) => set({ steps: scene.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const step = stepIdx != null ? scene.steps[stepIdx] : null;

  // positions as they are at the selected step (base + accumulated moves)
  const positions = useMemo(() => {
    const pos: Record<string, Pt> = Object.fromEntries(scene.players.map((p) => [p.id, { x: p.x, y: p.y }]));
    let ball = scene.ball;
    scene.steps.slice(0, stepIdx == null ? 0 : stepIdx + 1).forEach((s) => {
      Object.assign(pos, s.players ?? {});
      if (s.ball) ball = s.ball;
    });
    return { pos, ball };
  }, [scene, stepIdx]);

  const ids = scene.players.map((p) => p.id);
  const refOptions = [...ids.map((id) => ({ value: id, label: id })), { value: "__pt", label: "point (x,y)" }];

  const placeAt = (pt: Pt) => {
    if (!target) return;
    const x = Math.round(pt.x * 10) / 10, y = Math.round(pt.y * 10) / 10;
    if (target.kind === "base") set({ players: scene.players.map((p) => (p.id === target.id ? { ...p, x, y } : p)) });
    else if (target.kind === "move") setStep(target.step, { players: { ...(scene.steps[target.step].players ?? {}), [target.id]: { x, y } } });
    else if (target.kind === "ball") (target.step == null ? set({ ball: { x, y } }) : setStep(target.step, { ball: { x, y } }));
    else if (target.kind === "arrow") {
      const arrows = [...(scene.steps[target.step].arrows ?? [])];
      arrows[target.i] = { ...arrows[target.i], [target.end]: { x, y } };
      setStep(target.step, { arrows });
    } else if (target.kind === "zone") setStep(target.step, { zone: { rx: 10, ry: 7, ...(scene.steps[target.step].zone ?? {}), x, y } });
    if (target.kind !== "move" && target.kind !== "base") setTarget(null);
  };

  const onPitchClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    placeAt({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  const refPt = (ref: string | Pt): Pt | null => (typeof ref === "string" ? positions.pos[ref] ?? null : ref);

  if (json !== null) {
    return (
      <div className="grid gap-2">
        <textarea className="mono text-xs" rows={30} value={json} onChange={(e) => setJson(e.target.value)} />
        {jsonErr && <div className="text-sm text-[var(--red)]">{jsonErr}</div>}
        <div className="flex gap-2">
          <button
            className="btn btn-gold"
            onClick={() => {
              try {
                const v = JSON.parse(json);
                onChange({ ...v, type: "board" });
                setJson(null);
                setJsonErr("");
              } catch (e) {
                setJsonErr((e as Error).message);
              }
            }}
          >
            Apply JSON
          </button>
          <button className="btn" onClick={() => setJson(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2 items-end">
        <Text label="Title" value={scene.title} onChange={(v) => set({ title: v })} placeholder="THE *RESTART*" hint="*gold*" className="flex-1 min-w-48" />
        <button className="btn" onClick={() => setJson(JSON.stringify(scene, null, 2))}>
          Edit as JSON
        </button>
      </div>

      <div className="grid grid-cols-[300px_1fr] gap-4">
        {/* mini pitch */}
        <div>
          <svg viewBox="0 0 100 154" className="w-[300px] rounded border border-[var(--line)] cursor-crosshair" style={{ background: "#256F34" }} onClick={onPitchClick}>
            <g fill="none" stroke="rgba(255,255,255,.7)" strokeWidth={0.6}>
              <rect x={3} y={3} width={94} height={148} />
              <line x1={3} y1={77} x2={97} y2={77} />
              <circle cx={50} cy={77} r={12.5} />
              <rect x={22} y={3} width={56} height={23} />
              <rect x={22} y={128} width={56} height={23} />
              <rect x={37.5} y={3} width={25} height={8} />
              <rect x={37.5} y={143} width={25} height={8} />
            </g>
            {step?.zone && <ellipse cx={3 + step.zone.x * 0.94} cy={3 + step.zone.y * 1.48} rx={step.zone.rx * 0.94} ry={step.zone.ry * 1.48} fill="rgba(244,192,78,.25)" stroke="#F4C04E" strokeWidth={0.5} strokeDasharray="1.5 1" />}
            {(step?.lines ?? []).map((l, i) => {
              const a = positions.pos[l.from], b = positions.pos[l.to];
              if (!a || !b) return null;
              return <line key={i} x1={3 + a.x * 0.94} y1={3 + a.y * 1.48} x2={3 + b.x * 0.94} y2={3 + b.y * 1.48} stroke={l.color === "white" ? "#fff" : l.color === "gold" ? "#F4C04E" : "#E5142A"} strokeWidth={0.9} opacity={0.85} />;
            })}
            {(step?.arrows ?? []).map((ar, i) => {
              const a = refPt(ar.from), b = refPt(ar.to);
              if (!a || !b) return null;
              const red = ar.style === "key" || ar.style === "press";
              return <line key={i} x1={3 + a.x * 0.94} y1={3 + a.y * 1.48} x2={3 + b.x * 0.94} y2={3 + b.y * 1.48} stroke={red ? "#E5142A" : "#fff"} strokeWidth={ar.style === "key" ? 1.2 : 0.7} strokeDasharray={ar.style === "pass" || ar.style === "press" ? "1.6 1.2" : undefined} markerEnd="url(#mini-arrow)" />;
            })}
            <defs>
              <marker id="mini-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#fff" />
              </marker>
            </defs>
            {scene.players.map((p) => {
              const pos = positions.pos[p.id];
              const sel = (target?.kind === "base" || target?.kind === "move") && target.id === p.id;
              const hl = step?.highlight?.includes(p.id);
              return (
                <g key={p.id} transform={`translate(${3 + pos.x * 0.94} ${3 + pos.y * 1.48})`}>
                  {hl && <circle r={4.2} fill="none" stroke="#F4C04E" strokeWidth={0.6} />}
                  <circle r={2.8} fill={p.team === "home" ? scene.homeColor ?? "#E5142A" : scene.awayColor ?? "#8EC5F2"} stroke={sel ? "#F4C04E" : "#0A0A0C"} strokeWidth={sel ? 1 : 0.5} />
                  {p.name && (
                    <text y={6} textAnchor="middle" fontSize={2.6} fill="#fff" fontWeight={700}>
                      {p.name.toUpperCase()}
                    </text>
                  )}
                </g>
              );
            })}
            {positions.ball && <circle cx={3 + positions.ball.x * 0.94} cy={3 + positions.ball.y * 1.48} r={1.5} fill="#F4C04E" stroke="#0A0A0C" strokeWidth={0.4} />}
          </svg>
          <div className="text-xs text-[var(--muted)] mt-2 min-h-8">
            {target ? (
              <span className="text-[var(--gold)]">Click the pitch to place {target.kind === "ball" ? "the ball" : target.kind === "arrow" ? `arrow ${target.end}` : target.kind === "zone" ? "the zone" : target.id}. </span>
            ) : (
              <span>Select a player (or “place” on a step element), then click the pitch. Showing positions as of {step ? `step ${stepIdx! + 1}` : "kick-off"}.</span>
            )}
            {target && (
              <button className="underline" onClick={() => setTarget(null)}>
                done
              </button>
            )}
          </div>
        </div>

        {/* players */}
        <div className="grid gap-3 content-start">
          <div className="flex flex-wrap gap-2 items-end">
            <Select label="Home preset" value="" onChange={(v) => v && set({ players: [...scene.players.filter((p) => p.team !== "home"), ...preset("home", v)] })} options={Object.keys(PRESETS).map((k) => ({ value: k, label: k }))} allowEmpty="replace home…" className="w-40" />
            <Select label="Away preset" value="" onChange={(v) => v && set({ players: [...scene.players.filter((p) => p.team !== "away"), ...preset("away", v)] })} options={Object.keys(PRESETS).map((k) => ({ value: k, label: k }))} allowEmpty="replace away…" className="w-40" />
            <Text label="Home colour" value={scene.homeColor} onChange={(v) => set({ homeColor: v })} placeholder="#E5142A" className="w-32" />
            <Text label="Away colour" value={scene.awayColor} onChange={(v) => set({ awayColor: v })} placeholder="#8EC5F2" className="w-32" />
            <button className="btn" onClick={() => setTarget({ kind: "ball", step: null })}>
              Place ball
            </button>
          </div>
          <div className="max-h-72 overflow-auto scrollbar-thin border border-[var(--line)] rounded">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--surface-2)] text-[var(--muted)]">
                <tr>
                  <th className="text-left p-1.5">id</th>
                  <th className="text-left p-1.5">team</th>
                  <th className="text-left p-1.5">x</th>
                  <th className="text-left p-1.5">y</th>
                  <th className="text-left p-1.5">name tag</th>
                  <th className="p-1.5" />
                </tr>
              </thead>
              <tbody>
                {scene.players.map((p, i) => {
                  const sel = target?.kind === "base" && target.id === p.id;
                  const upd = (patch: Partial<typeof p>) => set({ players: scene.players.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <tr key={i} className={sel ? "bg-[rgba(244,192,78,.12)]" : ""}>
                      <td className="p-1">
                        <input className="mono !py-1 min-w-24" value={p.id} onChange={(e) => upd({ id: e.target.value })} />
                      </td>
                      <td className="p-1">
                        <select className="!py-1" value={p.team} onChange={(e) => upd({ team: e.target.value as "home" | "away" })}>
                          <option value="home">home</option>
                          <option value="away">away</option>
                        </select>
                      </td>
                      <td className="p-1 w-16">
                        <input className="!py-1" type="number" value={p.x} onChange={(e) => upd({ x: Number(e.target.value) })} />
                      </td>
                      <td className="p-1 w-16">
                        <input className="!py-1" type="number" value={p.y} onChange={(e) => upd({ y: Number(e.target.value) })} />
                      </td>
                      <td className="p-1">
                        <input className="!py-1" value={p.name ?? ""} placeholder="—" onChange={(e) => upd({ name: e.target.value || undefined })} />
                      </td>
                      <td className="p-1 whitespace-nowrap">
                        <button className="btn !px-2 !py-1" title="place on pitch" onClick={() => setTarget(sel ? null : { kind: "base", id: p.id })}>
                          {sel ? "placing…" : "place"}
                        </button>{" "}
                        <button className="btn !px-2 !py-1" onClick={() => set({ players: scene.players.filter((_, j) => j !== i) })}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn w-fit" onClick={() => set({ players: [...scene.players, { id: `p${scene.players.length + 1}`, team: "home", x: 50, y: 60 }] })}>
            + player
          </button>
        </div>
      </div>

      {/* card */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <Text label="Card name" value={scene.card?.name} onChange={(v) => set({ card: v ? { ...(scene.card ?? { name: "" }), name: v } : undefined })} placeholder="Alysson (sketch card, optional)" />
        <Text label="Card sub" value={scene.card?.sub} onChange={(v) => scene.card && set({ card: { ...scene.card, sub: v } })} placeholder="VILLA · 1'" />
        <Select label="Side" value={scene.card?.side} onChange={(v) => scene.card && set({ card: { ...scene.card, side: v as "left" | "right" | undefined } })} options={[{ value: "left", label: "left" }, { value: "right", label: "right" }]} allowEmpty="left" className="w-28" />
      </div>
      {scene.card && <AssetPicker label="Card image (sketch / AI plate)" slug={slug} kind="image" value={scene.card.img} assets={assets} onAssets={onAssets} onChange={(v) => scene.card && set({ card: { ...scene.card, img: v } })} />}

      {/* steps */}
      <div className="grid gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="!mb-0">Steps</label>
          {scene.steps.map((s, i) => (
            <button key={i} className={`btn !py-1 ${stepIdx === i ? "btn-gold" : ""}`} onClick={() => setStepIdx(i)}>
              {i + 1}
              {s.label ? ` · ${s.label.replace(/\*/g, "")}` : ""}
            </button>
          ))}
          <button
            className="btn !py-1"
            onClick={() => {
              set({ steps: [...scene.steps, {}] });
              setStepIdx(scene.steps.length);
            }}
          >
            + step
          </button>
        </div>

        {step && stepIdx != null && (
          <div className="card p-3 grid gap-3">
            <Row cols={5}>
              <Num label="At (s)" value={step.at} onChange={(v) => setStep(stepIdx, { at: v })} step={0.1} min={0} placeholder="auto" />
              <Text label="Label" value={step.label} onChange={(v) => setStep(stepIdx, { label: v })} placeholder="LINE NOT *SET*" className="col-span-2" />
              <Num label="Zoom ×" value={step.zoom?.scale} onChange={(v) => setStep(stepIdx, { zoom: v ? { x: step.zoom?.x ?? 50, y: step.zoom?.y ?? 50, scale: v } : undefined })} step={0.05} min={1} max={3} placeholder="1" />
              <div className="pt-5">
                <button className="btn w-full" disabled={!step.zoom} onClick={() => setTarget({ kind: "zone", step: stepIdx })} title="zoom centre uses the zone click; set below">
                  zoom at zone
                </button>
              </div>
            </Row>
            {step.zoom && (
              <Row cols={4}>
                <Num label="Zoom centre x" value={step.zoom.x} onChange={(v) => setStep(stepIdx, { zoom: { ...step.zoom!, x: v ?? 50 } })} />
                <Num label="Zoom centre y" value={step.zoom.y} onChange={(v) => setStep(stepIdx, { zoom: { ...step.zoom!, y: v ?? 50 } })} />
              </Row>
            )}

            <div>
              <label>Highlight (gold ring)</label>
              <div className="flex flex-wrap gap-1">
                {ids.map((id) => {
                  const on = step.highlight?.includes(id);
                  return (
                    <button key={id} className={`btn !px-2 !py-0.5 !text-xs ${on ? "btn-gold" : ""}`} onClick={() => setStep(stepIdx, { highlight: on ? step.highlight!.filter((x) => x !== id) : [...(step.highlight ?? []), id] })}>
                      {id}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-1">
              <label>Moves in this step</label>
              {Object.entries(step.players ?? {}).map(([id, pt]) => (
                <div key={id} className="flex gap-2 items-center text-xs">
                  <span className="mono w-24">{id}</span>
                  <span className="text-[var(--muted)]">→ {pt.x}, {pt.y}</span>
                  <button className="btn !px-2 !py-0.5" onClick={() => setTarget({ kind: "move", step: stepIdx, id })}>
                    place
                  </button>
                  <button
                    className="btn !px-2 !py-0.5"
                    onClick={() => {
                      const { [id]: _drop, ...rest } = step.players ?? {};
                      setStep(stepIdx, { players: Object.keys(rest).length ? rest : undefined });
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex gap-2 items-center">
                <select
                  className="!w-40 !py-1"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    const cur = positions.pos[id];
                    setStep(stepIdx, { players: { ...(step.players ?? {}), [id]: { x: cur.x, y: cur.y } } });
                    setTarget({ kind: "move", step: stepIdx, id });
                  }}
                >
                  <option value="">+ move a player…</option>
                  {ids.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
                <button className="btn !py-1" onClick={() => setTarget({ kind: "ball", step: stepIdx })}>
                  {step.ball ? `ball → ${step.ball.x}, ${step.ball.y}` : "move ball"}
                </button>
              </div>
            </div>

            <div className="grid gap-1">
              <label>Shape lines</label>
              {(step.lines ?? []).map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_100px_auto] gap-2">
                  <select className="!py-1" value={l.from} onChange={(e) => setStep(stepIdx, { lines: step.lines!.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })}>
                    {ids.map((id) => (
                      <option key={id}>{id}</option>
                    ))}
                  </select>
                  <select className="!py-1" value={l.to} onChange={(e) => setStep(stepIdx, { lines: step.lines!.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })}>
                    {ids.map((id) => (
                      <option key={id}>{id}</option>
                    ))}
                  </select>
                  <select className="!py-1" value={l.color ?? ""} onChange={(e) => setStep(stepIdx, { lines: step.lines!.map((x, j) => (j === i ? { ...x, color: (e.target.value || undefined) as "red" | "white" | "gold" | undefined } : x)) })}>
                    <option value="">auto</option>
                    {LINE_COLORS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button className="btn !px-2 !py-1" onClick={() => setStep(stepIdx, { lines: step.lines!.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <button className="btn !py-1 w-fit" onClick={() => setStep(stepIdx, { lines: [...(step.lines ?? []), { from: ids[0] ?? "", to: ids[1] ?? ids[0] ?? "" }] })}>
                  + line
                </button>
                <button
                  className="btn !py-1 w-fit"
                  title="connect the home back line in order"
                  onClick={() => {
                    const back = scene.players.filter((p) => p.team === "home" && /_(lb|lcb|cb|rcb|rb|lwb|rwb)$/.test(p.id)).sort((a, b) => positions.pos[a.id].x - positions.pos[b.id].x);
                    const lines = back.slice(1).map((p, i) => ({ from: back[i].id, to: p.id }));
                    setStep(stepIdx, { lines: [...(step.lines ?? []), ...lines] });
                  }}
                >
                  + home back line
                </button>
              </div>
            </div>

            <div className="grid gap-1">
              <label>Arrows</label>
              {(step.arrows ?? []).map((ar, i) => {
                const upd = (patch: Partial<typeof ar>) => setStep(stepIdx, { arrows: step.arrows!.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                const endSel = (end: "from" | "to") => {
                  const v = ar[end];
                  return (
                    <div className="flex gap-1 items-center">
                      <select className="!py-1" value={typeof v === "string" ? v : "__pt"} onChange={(e) => upd({ [end]: e.target.value === "__pt" ? refPt(v) ?? { x: 50, y: 50 } : e.target.value })}>
                        {refOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {typeof v !== "string" && (
                        <button className="btn !px-2 !py-1 whitespace-nowrap" onClick={() => setTarget({ kind: "arrow", step: stepIdx, i, end })}>
                          {v.x},{v.y} place
                        </button>
                      )}
                    </div>
                  );
                };
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_90px_70px_auto] gap-2 items-center">
                    {endSel("from")}
                    {endSel("to")}
                    <select className="!py-1" value={ar.style ?? "pass"} onChange={(e) => upd({ style: e.target.value as "pass" | "run" | "key" | "press" })}>
                      {ARROW_STYLES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input className="!py-1" type="number" step={0.05} min={-1} max={1} value={ar.curve ?? ""} placeholder="curve" onChange={(e) => upd({ curve: e.target.value === "" ? undefined : Number(e.target.value) })} />
                    <button className="btn !px-2 !py-1" onClick={() => setStep(stepIdx, { arrows: step.arrows!.filter((_, j) => j !== i) })}>
                      ✕
                    </button>
                  </div>
                );
              })}
              <button className="btn !py-1 w-fit" onClick={() => setStep(stepIdx, { arrows: [...(step.arrows ?? []), { from: ids[0] ?? { x: 50, y: 50 }, to: { x: 50, y: 70 }, style: "pass" }] })}>
                + arrow
              </button>
            </div>

            <div className="grid gap-1">
              <div className="flex items-center gap-3">
                <Check label="Zone (shaded ellipse)" value={!!step.zone} onChange={(v) => setStep(stepIdx, { zone: v ? { x: 50, y: 70, rx: 10, ry: 7 } : undefined })} />
                {step.zone && (
                  <button className="btn !py-1" onClick={() => setTarget({ kind: "zone", step: stepIdx })}>
                    place zone
                  </button>
                )}
              </div>
              {step.zone && (
                <Row cols={5}>
                  <Num label="x" value={step.zone.x} onChange={(v) => setStep(stepIdx, { zone: { ...step.zone!, x: v ?? 50 } })} />
                  <Num label="y" value={step.zone.y} onChange={(v) => setStep(stepIdx, { zone: { ...step.zone!, y: v ?? 50 } })} />
                  <Num label="rx" value={step.zone.rx} onChange={(v) => setStep(stepIdx, { zone: { ...step.zone!, rx: v ?? 10 } })} />
                  <Num label="ry" value={step.zone.ry} onChange={(v) => setStep(stepIdx, { zone: { ...step.zone!, ry: v ?? 7 } })} />
                  <Text label="label" value={step.zone.label} onChange={(v) => setStep(stepIdx, { zone: { ...step.zone!, label: v } })} placeholder="space" />
                </Row>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button className="btn" disabled={stepIdx === 0} onClick={() => { const s = [...scene.steps]; [s[stepIdx - 1], s[stepIdx]] = [s[stepIdx], s[stepIdx - 1]]; set({ steps: s }); setStepIdx(stepIdx - 1); }}>
                ↑
              </button>
              <button className="btn" disabled={stepIdx === scene.steps.length - 1} onClick={() => { const s = [...scene.steps]; [s[stepIdx + 1], s[stepIdx]] = [s[stepIdx], s[stepIdx + 1]]; set({ steps: s }); setStepIdx(stepIdx + 1); }}>
                ↓
              </button>
              <button className="btn" onClick={() => { set({ steps: [...scene.steps.slice(0, stepIdx + 1), JSON.parse(JSON.stringify(step)), ...scene.steps.slice(stepIdx + 1)] }); setStepIdx(stepIdx + 1); }}>
                duplicate
              </button>
              <button className="btn" disabled={scene.steps.length <= 1} onClick={() => { set({ steps: scene.steps.filter((_, j) => j !== stepIdx) }); setStepIdx(Math.max(0, stepIdx - 1)); }}>
                delete step
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
