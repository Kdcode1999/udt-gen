"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { Script, BRANDS, FPS, type SceneT, type Timeline, type VoManifestT } from "@utd/video";
import { SceneForm } from "./SceneForm";
import { Preview } from "./Preview";
import { JobPanel, type Job } from "./JobPanel";
import type { AssetInfo } from "./AssetPicker";
import { Check, Num, Row, Section, Select, Text } from "./fields";
import { AssetPicker } from "./AssetPicker";

type Outputs = { mp4?: string; thumb?: string; srt?: string; voSheet?: string; stills: { name: string; url: string }[]; renderedAt?: number };
type Issue = { path: string; message: string };
type AnyScript = Record<string, unknown> & { scenes: SceneT[]; voice?: Record<string, unknown>; music?: Record<string, unknown>; captions?: Record<string, unknown> };

const SCENE_TYPES: { type: SceneT["type"]; label: string; make: () => SceneT }[] = [
  { type: "hook", label: "Hook word", make: () => ({ type: "hook", word: "WHY?", sub: "" }) },
  { type: "stat", label: "Stat card", make: () => ({ type: "stat", value: 0, label: "LABEL" }) },
  { type: "quote", label: "Quote", make: () => ({ type: "quote", text: "", who: "" }) },
  { type: "compare", label: "Compare", make: () => ({ type: "compare", left: { name: "A" }, right: { name: "B" }, rows: [{ label: "Goals", left: 0, right: 0 }] }) },
  {
    type: "board",
    label: "Tactical board",
    make: () => ({
      type: "board",
      title: "THE *SHAPE*",
      players: [
        { id: "h_gk", team: "home", x: 50, y: 94 }, { id: "h_lb", team: "home", x: 15, y: 78 }, { id: "h_lcb", team: "home", x: 37, y: 80 }, { id: "h_rcb", team: "home", x: 63, y: 80 }, { id: "h_rb", team: "home", x: 85, y: 78 },
        { id: "h_dm1", team: "home", x: 38, y: 66 }, { id: "h_dm2", team: "home", x: 62, y: 66 }, { id: "h_lw", team: "home", x: 18, y: 52 }, { id: "h_am", team: "home", x: 50, y: 54 }, { id: "h_rw", team: "home", x: 82, y: 52 }, { id: "h_st", team: "home", x: 50, y: 40 },
        { id: "a_gk", team: "away", x: 50, y: 6 }, { id: "a_lb", team: "away", x: 85, y: 22 }, { id: "a_lcb", team: "away", x: 63, y: 20 }, { id: "a_rcb", team: "away", x: 37, y: 20 }, { id: "a_rb", team: "away", x: 15, y: 22 },
        { id: "a_dm1", team: "away", x: 62, y: 34 }, { id: "a_dm2", team: "away", x: 38, y: 34 }, { id: "a_lw", team: "away", x: 82, y: 48 }, { id: "a_am", team: "away", x: 50, y: 46 }, { id: "a_rw", team: "away", x: 18, y: 48 }, { id: "a_st", team: "away", x: 50, y: 60 },
      ],
      ball: { x: 50, y: 46 },
      steps: [{ lines: [{ from: "h_lb", to: "h_lcb" }, { from: "h_lcb", to: "h_rcb" }, { from: "h_rcb", to: "h_rb" }] }],
    }),
  },
  { type: "image", label: "Image", make: () => ({ type: "image", src: "" }) },
  { type: "footage", label: "Footage", make: () => ({ type: "footage", src: "" }) },
  { type: "cta", label: "Follow / CTA", make: () => ({ type: "cta" }) },
];

const sceneTitle = (s: SceneT): string => {
  switch (s.type) {
    case "hook": return s.word;
    case "stat": return `${s.prefix ?? ""}${s.value}${s.suffix ?? ""} ${s.label}`;
    case "quote": return `“${s.text.slice(0, 40)}${s.text.length > 40 ? "…" : ""}”`;
    case "compare": return `${s.left.name} vs ${s.right.name}`;
    case "board": return (s.title ?? "board").replace(/\*/g, "");
    case "image": return s.caption ?? s.src.split("/").pop() ?? "image";
    case "footage": return s.label ?? s.caption ?? s.src.split("/").pop() ?? "footage";
    case "cta": return s.line ?? "Follow";
  }
};

const fmt = (frames: number) => {
  const s = frames / FPS;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

export const Editor: React.FC<{ slug: string; initial: unknown }> = ({ slug, initial }) => {
  const [script, setScript] = useState<AnyScript>(initial as AnyScript);
  const [saved, setSaved] = useState<string>(JSON.stringify(initial));
  const [selected, setSelected] = useState<number | "settings">(0);
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [vo, setVo] = useState<VoManifestT | null>(null);
  const [outputs, setOutputs] = useState<Outputs>({ stills: [] });
  const [job, setJob] = useState<Job | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");
  const [showStills, setShowStills] = useState(false);
  const [research, setResearch] = useState<string | null>(null);
  const [showResearch, setShowResearch] = useState(false);
  const [draftOk, setDraftOk] = useState(false);
  const [brief, setBrief] = useState("");
  const [lengthSec, setLengthSec] = useState(60);
  const player = useRef<PlayerRef>(null);

  const dirty = JSON.stringify(script) !== saved;
  const issues: Issue[] = useMemo(() => {
    const r = Script.safeParse(script);
    return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  }, [script]);
  const valid = issues.length === 0;

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/videos/${slug}`);
    if (!r.ok) return;
    const j = await r.json();
    setAssets(j.assets);
    setVo(j.vo);
    setOutputs(j.outputs);
    setJob(j.job);
    setResearch(j.research ?? null);
    setDraftOk(!!j.draftConfigured);
    return j as { script: AnyScript; job: Job | null };
  }, [slug]);
  useEffect(() => void refresh(), [refresh]);

  // Ctrl/Cmd+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(""), 2500);
  };

  const save = async (): Promise<boolean> => {
    if (!valid) {
      say("Fix the red fields first");
      return false;
    }
    setSaving(true);
    const r = await fetch(`/api/videos/${slug}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(script) });
    setSaving(false);
    if (!r.ok) {
      say("Save failed");
      return false;
    }
    setSaved(JSON.stringify(script));
    say("Saved");
    return true;
  };

  const run = async (kind: "vo" | "render" | "stills", body: Record<string, unknown> = {}) => {
    if (dirty || !valid) {
      const ok = await save();
      if (!ok) return;
    }
    const r = await fetch(`/api/videos/${slug}/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return say(j.error ?? "could not start");
    setJob(j.job);
  };

  const startDraft = async () => {
    const r = await fetch(`/api/videos/${slug}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief, lengthSec, title: script.title, series: script.series }) });
    const j = await r.json();
    if (!r.ok) return say(j.error ?? "could not start");
    setJob(j.job);
  };

  const scenes = script.scenes ?? [];
  const setScenes = (next: SceneT[]) => setScript({ ...script, scenes: next });
  const sel = typeof selected === "number" ? scenes[selected] : null;

  const seekTo = (i: number) => {
    const t = timeline?.scenes[i];
    if (!t || !player.current) return;
    player.current.seekTo(t.start + 1);
    player.current.play();
  };

  const voStale = useMemo(() => {
    if (!vo) return scenes.some((s) => s.vo);
    return scenes.some((s, i) => s.vo && vo.scenes[String(i)]?.text?.trim() !== s.vo.trim());
  }, [vo, scenes]);

  const busy = job?.status === "running";

  return (
    <div className="grid grid-cols-[260px_minmax(0,1fr)_400px] h-[calc(100vh-3rem)]">
      {/* scene list */}
      <aside className="border-r border-[var(--line)] overflow-y-auto scrollbar-thin p-3 flex flex-col gap-2">
        <button className={`text-left card p-3 ${selected === "settings" ? "border-[var(--gold)]" : ""}`} onClick={() => setSelected("settings")}>
          <div className="font-bold leading-tight line-clamp-2">{String(script.title ?? slug)}</div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {String(script.series ?? "")} · {scenes.length} scenes{timeline ? ` · ${fmt(timeline.total)}` : ""} · settings
          </div>
        </button>
        {scenes.map((s, i) => {
          const t = timeline?.scenes[i];
          const bad = issues.some((x) => x.path.startsWith(`scenes.${i}.`) || x.path === `scenes.${i}`);
          return (
            <div key={i} className={`card p-2.5 cursor-pointer ${selected === i ? "border-[var(--gold)]" : ""} ${bad ? "!border-[var(--red)]" : ""}`} onClick={() => setSelected(i)}>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--muted)]">
                <span>
                  {i + 1} · {s.type}
                </span>
                <span>{t ? `${fmt(t.start)} · ${(t.duration / FPS).toFixed(1)}s` : ""}</span>
              </div>
              <div className="text-sm font-semibold leading-tight mt-1 line-clamp-2">{sceneTitle(s)}</div>
              {s.vo && <div className="text-[11px] text-[var(--muted)] mt-1 line-clamp-2">{s.vo}</div>}
              <div className="flex gap-1 mt-2">
                <button className="btn !px-2 !py-0.5 !text-[11px]" onClick={(e) => { e.stopPropagation(); seekTo(i); }} title="play from here">
                  ▶
                </button>
                <button className="btn !px-2 !py-0.5 !text-[11px]" disabled={i === 0} onClick={(e) => { e.stopPropagation(); const n = [...scenes]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setScenes(n); setSelected(i - 1); }}>
                  ↑
                </button>
                <button className="btn !px-2 !py-0.5 !text-[11px]" disabled={i === scenes.length - 1} onClick={(e) => { e.stopPropagation(); const n = [...scenes]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setScenes(n); setSelected(i + 1); }}>
                  ↓
                </button>
                <button className="btn !px-2 !py-0.5 !text-[11px]" onClick={(e) => { e.stopPropagation(); setScenes([...scenes.slice(0, i + 1), JSON.parse(JSON.stringify(s)), ...scenes.slice(i + 1)]); setSelected(i + 1); }} title="duplicate">
                  ⧉
                </button>
                <button className="btn !px-2 !py-0.5 !text-[11px] ml-auto" disabled={scenes.length <= 1} onClick={(e) => { e.stopPropagation(); setScenes(scenes.filter((_, j) => j !== i)); setSelected(Math.max(0, i - 1)); }} title="delete">
                  ✕
                </button>
              </div>
            </div>
          );
        })}
        <select
          className="mt-1"
          value=""
          onChange={(e) => {
            const t = SCENE_TYPES.find((x) => x.type === e.target.value);
            if (!t) return;
            const insertAt = typeof selected === "number" ? selected + 1 : scenes.length;
            // keep the CTA last
            const lastIsCta = scenes[scenes.length - 1]?.type === "cta";
            const at = lastIsCta && insertAt >= scenes.length ? scenes.length - 1 : insertAt;
            setScenes([...scenes.slice(0, at), t.make(), ...scenes.slice(at)]);
            setSelected(at);
          }}
        >
          <option value="">+ Add scene after selected…</option>
          {SCENE_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
      </aside>

      {/* form */}
      <main className="overflow-y-auto scrollbar-thin p-4">
        {job?.kind === "draft" && job.status === "running" && (
          <div className="mb-4 card p-5 border-[var(--gold)] grid gap-2">
            <div className="display text-3xl leading-none">
              Researching &amp; writing<span className="text-[var(--gold)]">…</span>
            </div>
            <div className="text-sm text-[var(--muted)]">Claude is searching the web for the facts and drafting every scene. Usually 1–2 minutes. The scenes below get replaced when it finishes.</div>
            <div className="text-sm">{job.message}</div>
          </div>
        )}
        {job?.kind === "draft" && job.status === "failed" && (
          <div className="mb-4 card p-4 border-[var(--red)] text-sm">
            <b className="text-[var(--red)]">Draft failed:</b> {job.message}
          </div>
        )}
        {selected === "settings" ? (
          <div className="grid gap-4 max-w-3xl">
            <Section title="Video">
              <Row>
                <Text label="Title" value={script.title as string} onChange={(v) => setScript({ ...script, title: v ?? "" })} />
                <Text label="Series tag" value={script.series as string | undefined} onChange={(v) => setScript({ ...script, series: v })} placeholder="MATCH DIARY" hint="top-left pill" />
              </Row>
              <Row cols={3}>
                <Select label="Brand" value={script.brand as string | undefined} onChange={(v) => setScript({ ...script, brand: v })} options={Object.keys(BRANDS).map((b) => ({ value: b, label: BRANDS[b].name }))} allowEmpty="utd" />
                <Select label="Captions" value={script.captions?.mode as string | undefined} onChange={(v) => setScript({ ...script, captions: { ...(script.captions ?? {}), mode: v } })} options={[{ value: "chunk", label: "chunks (2–3 words)" }, { value: "word", label: "one word at a time" }, { value: "off", label: "off" }]} allowEmpty="chunks" />
                <div className="pt-6">
                  <Check label="Safe-zone overlay (debug)" value={script.debug as boolean | undefined} onChange={(v) => setScript({ ...script, debug: v })} />
                </div>
              </Row>
            </Section>
            <Section title="Voice">
              <Row cols={3}>
                <Select label="Provider" value={script.voice?.provider as string | undefined} onChange={(v) => setScript({ ...script, voice: { ...(script.voice ?? {}), provider: v } })} options={[{ value: "elevenlabs", label: "ElevenLabs" }, { value: "edge", label: "Edge (free draft)" }, { value: "estimate", label: "none (estimate timing)" }]} allowEmpty="ElevenLabs" />
                <Text label="Voice ID" value={script.voice?.voiceId as string | undefined} onChange={(v) => setScript({ ...script, voice: { ...(script.voice ?? {}), voiceId: v } })} placeholder="onwK4e9ZLuTAKqWW03F9" hint="Daniel (premade) by default" />
                <Text label="Model" value={script.voice?.modelId as string | undefined} onChange={(v) => setScript({ ...script, voice: { ...(script.voice ?? {}), modelId: v } })} placeholder="eleven_multilingual_v2" />
                <Num label="Stability" value={script.voice?.stability as number | undefined} onChange={(v) => setScript({ ...script, voice: { ...(script.voice ?? {}), stability: v } })} step={0.05} min={0} max={1} placeholder="0.45" />
                <Num label="Similarity" value={script.voice?.similarity as number | undefined} onChange={(v) => setScript({ ...script, voice: { ...(script.voice ?? {}), similarity: v } })} step={0.05} min={0} max={1} placeholder="0.8" />
                <Num label="Speed" value={script.voice?.speed as number | undefined} onChange={(v) => setScript({ ...script, voice: { ...(script.voice ?? {}), speed: v } })} step={0.05} min={0.7} max={1.2} placeholder="1.0" />
              </Row>
            </Section>
            <Section title="Music">
              <Row cols={3}>
                <Select label="Bed" value={script.music?.src === "placeholder" ? "placeholder" : script.music?.src ? "asset" : ""} onChange={(v) => setScript({ ...script, music: v === "placeholder" ? { ...(script.music ?? {}), src: "placeholder" } : v === "asset" ? { ...(script.music ?? {}), src: assets.find((a) => a.kind === "audio")?.path ?? "" } : { ...(script.music ?? {}), src: undefined } })} options={[{ value: "placeholder", label: "placeholder pad" }, { value: "asset", label: "uploaded track" }]} allowEmpty="none" />
                <Num label="Volume" value={script.music?.volume as number | undefined} onChange={(v) => setScript({ ...script, music: { ...(script.music ?? {}), volume: v } })} step={0.02} min={0} max={1} placeholder="0.16" />
                <Num label="Duck under voice" value={script.music?.duck as number | undefined} onChange={(v) => setScript({ ...script, music: { ...(script.music ?? {}), duck: v } })} step={0.05} min={0} max={1} placeholder="0.35" hint="× volume" />
              </Row>
              {typeof script.music?.src === "string" && script.music.src !== "placeholder" && <AssetPicker label="Track" slug={slug} kind="audio" value={script.music.src as string} assets={assets} onAssets={setAssets} onChange={(v) => setScript({ ...script, music: { ...(script.music ?? {}), src: v } })} hint="use Facebook Sound Collection tracks to stay licence-safe" />}
            </Section>
            <Section title="Draft with AI" right={<span className="text-xs text-[var(--muted)]">{draftOk ? "Claude + live web search" : "set ANTHROPIC_API_KEY on this machine"}</span>}>
              <textarea rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Brief: topic, angle, what you already know. This replaces the current scenes with a researched draft." disabled={!draftOk} />
              <div className="flex items-center gap-2 flex-wrap">
                {[45, 60, 90, 120].map((n) => (
                  <button key={n} className={`btn !py-1 ${lengthSec === n ? "btn-gold" : ""}`} onClick={() => setLengthSec(n)} disabled={!draftOk}>
                    {n}s
                  </button>
                ))}
                <button className="btn btn-red ml-auto" disabled={!draftOk || busy} onClick={startDraft}>
                  Research & redraft
                </button>
              </div>
            </Section>
            {issues.length > 0 && (
              <Section title="Problems">
                <ul className="text-sm text-[var(--red)] grid gap-1">
                  {issues.map((i, k) => (
                    <li key={k}>
                      <span className="mono">{i.path || "(root)"}</span>: {i.message}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        ) : sel ? (
          <div className="max-w-3xl">
            {issues.filter((x) => x.path.startsWith(`scenes.${selected}.`)).length > 0 && (
              <div className="mb-3 text-sm text-[var(--red)]">
                {issues
                  .filter((x) => x.path.startsWith(`scenes.${selected}.`))
                  .map((x, k) => (
                    <div key={k}>
                      <span className="mono">{x.path.replace(`scenes.${selected}.`, "")}</span>: {x.message}
                    </div>
                  ))}
              </div>
            )}
            <SceneForm slug={slug} scene={sel} assets={assets} onAssets={setAssets} onChange={(s) => setScenes(scenes.map((x, j) => (j === selected ? s : x)))} />
          </div>
        ) : (
          <div className="text-[var(--muted)]">Select a scene.</div>
        )}
      </main>

      {/* preview + actions */}
      <aside className="border-l border-[var(--line)] overflow-y-auto scrollbar-thin p-3 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button className={`btn ${dirty ? "btn-gold" : ""}`} disabled={saving || !dirty} onClick={save}>
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
          <button className="btn" disabled={busy} onClick={() => run("vo")} title={voStale ? "voice is out of date with the script" : "voice is current"}>
            Voice{voStale ? " •" : ""}
          </button>
          <button className="btn" disabled={busy} onClick={() => run("stills")}>
            Stills
          </button>
          <button className="btn btn-red" disabled={busy} onClick={() => run("render")}>
            Render
          </button>
        </div>
        {flash && <div className="text-xs text-[var(--gold)]">{flash}</div>}
        {voStale && !busy && <div className="text-xs text-[var(--muted)]">Voice lines changed since the last Voice run — the preview uses estimated timing until you run Voice again.</div>}
        <JobPanel
          job={job}
          onFinished={async (j) => {
            setJob(j);
            const data = await refresh();
            if (j.kind === "stills") setShowStills(true);
            if (j.kind === "draft" && j.status === "done" && data?.script) {
              setScript(data.script);
              setSaved(JSON.stringify(data.script));
              setSelected(0);
              setShowResearch(true);
              say("Draft loaded — check the research notes");
            }
          }}
        />
        <div className="mx-auto w-full" style={{ maxWidth: "min(100%, calc((100vh - 330px) * 9 / 16))" }}>
          <Preview ref={player} slug={slug} script={script} vo={vo} onTimeline={setTimeline} />
        </div>
        {research && (
          <div className="card p-3 grid gap-2">
            <button className="text-left text-xs uppercase tracking-wider text-[var(--muted)] flex items-center justify-between" onClick={() => setShowResearch((v) => !v)}>
              <span>Research notes · verify before voicing</span>
              <span>{showResearch ? "▾" : "▸"}</span>
            </button>
            {showResearch && <pre className="text-[12px] leading-relaxed whitespace-pre-wrap font-[inherit] max-h-[50vh] overflow-auto scrollbar-thin">{research}</pre>}
          </div>
        )}
        {outputs.mp4 && (
          <div className="card p-3 grid gap-2">
            <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Last render {outputs.renderedAt ? `· ${new Date(outputs.renderedAt).toLocaleString()}` : ""}</div>
            <video src={outputs.mp4} controls className="w-full rounded" />
            <div className="flex gap-2 flex-wrap text-sm">
              <a className="btn btn-gold" href={outputs.mp4.split("?")[0]} download={`${slug}.mp4`}>
                Download MP4
              </a>
              {outputs.srt && (
                <a className="btn" href={outputs.srt} download>
                  SRT
                </a>
              )}
              {outputs.voSheet && (
                <a className="btn" href={outputs.voSheet} target="_blank" rel="noreferrer">
                  VO sheet
                </a>
              )}
            </div>
          </div>
        )}
        {outputs.stills.length > 0 && (
          <div className="card p-3 grid gap-2">
            <button className="text-left text-xs uppercase tracking-wider text-[var(--muted)]" onClick={() => setShowStills((s) => !s)}>
              Stills ({outputs.stills.length}) {showStills ? "▾" : "▸"}
            </button>
            {showStills && (
              <div className="grid grid-cols-3 gap-2">
                {outputs.stills.map((s) => (
                  <a key={s.name} href={s.url} target="_blank" rel="noreferrer" title={s.name}>
                    <img src={s.url} alt={s.name} className="rounded border border-[var(--line)]" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};
