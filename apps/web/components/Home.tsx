"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { VideoSummary } from "@/lib/store";
import { NewVideoModal } from "./NewVideo";

const ago = (ms?: number) => {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

type Filter = "all" | "draft" | "voiced" | "rendered";
const stage = (v: VideoSummary): Exclude<Filter, "all"> => (v.hasRender ? "rendered" : v.hasVo ? "voiced" : "draft");

export function Home({ videos }: { videos: VideoSummary[] }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const rel = (ms?: number) => (mounted ? ago(ms) : "");

  const shown = useMemo(
    () => videos.filter((v) => (filter === "all" || stage(v) === filter) && (!q || `${v.title} ${v.slug} ${v.series ?? ""}`.toLowerCase().includes(q.toLowerCase()))),
    [videos, filter, q],
  );
  const rendered = videos.filter((v) => v.hasRender);
  const minutes = videos.reduce((a, v) => a + v.durationSec, 0) / 60;
  const lastRender = rendered.map((v) => v.renderedAt ?? 0).sort((a, b) => b - a)[0];
  const counts = { all: videos.length, draft: videos.filter((v) => stage(v) === "draft").length, voiced: videos.filter((v) => stage(v) === "voiced").length, rendered: rendered.length };

  return (
    <main className="max-w-[1280px] mx-auto px-6 pb-16">
      {/* desk header */}
      <section className="pt-10 pb-8 grid gap-8 md:grid-cols-[1fr_auto] md:items-end border-b border-[var(--line)]">
        <div>
          <div className="text-[11px] tracking-[.16em] uppercase text-[var(--muted)]">UTD Diaries · production desk</div>
          <h1 className="display leading-[.92] mt-2" style={{ fontSize: "clamp(56px, 7vw, 96px)" }}>
            Script in.
            <br />
            <span className="text-[var(--red)]">Video</span> out.
          </h1>
          <p className="mt-4 max-w-md text-[var(--muted)]">Write the scenes, press Voice, press Render. Captions, sound and the follow card take care of themselves.</p>
        </div>
        <div className="flex gap-10 md:pb-2">
          <div className="stat-tile">
            <b className="tnum">{videos.length}</b>
            <span>videos</span>
          </div>
          <div className="stat-tile" style={{ borderColor: "var(--gold)" }}>
            <b className="tnum">{rendered.length}</b>
            <span>rendered</span>
          </div>
          <div className="stat-tile" style={{ borderColor: "var(--line)" }}>
            <b className="tnum">{minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)}</b>
            <span>minutes written</span>
          </div>
        </div>
      </section>

      {/* toolbar */}
      <section className="py-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--surface)] border border-[var(--line)]">
          {(["all", "draft", "voiced", "rendered"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider ${filter === f ? "bg-[var(--surface-2)] text-[var(--fg)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}>
              {f} <span className="tnum opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles…" className="!w-64" />
        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--muted)]">
          {lastRender && mounted ? <span>last render {ago(lastRender)}</span> : null}
          <Link href="/radar" className="btn">
            Find a topic
          </Link>
          <button className="btn btn-red" onClick={() => setOpen(true)}>
            + New video
          </button>
        </div>
      </section>

      {/* grid */}
      <section id="videos" className="grid gap-5 scroll-mt-20" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        <button className="new-card" onClick={() => setOpen(true)}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="text-xs font-bold tracking-[.14em] uppercase">New video</span>
        </button>

        {shown.map((v) => {
          const st = stage(v);
          return (
            <div key={v.slug} className="relative group">
            <Link href={`/v/${v.slug}`} className="poster">
              {v.thumb ? (
                <img src={v.thumb} alt="" />
              ) : (
                <>
                  <div className="glow" />
                  <div className="absolute inset-x-5 top-[34%]">
                    {v.kicker && <div className="text-[10px] font-black tracking-[.18em] uppercase text-[var(--red)] mb-2 truncate">{v.kicker}</div>}
                    <div className="display text-white leading-[.9] break-words" style={{ fontSize: (v.hookWord?.length ?? 8) > 9 ? 36 : 48 }}>
                      {v.hookWord ?? "DRAFT"}
                    </div>
                    <div className="h-1.5 w-20 bg-[var(--red)] mt-3" />
                  </div>
                </>
              )}
              <div className="shade" />
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                <span className={`pill ${st === "rendered" ? "gold" : st === "voiced" ? "" : "dim"}`}>
                  {st === "voiced" && v.voStale ? "voice stale" : st}
                </span>
                {v.invalid && <span className="pill red">fix script</span>}
              </div>
              <div className="absolute inset-x-4 bottom-4">
                {v.series && <div className="text-[10px] font-black tracking-[.18em] uppercase text-[var(--gold)] mb-1">{v.series}</div>}
                <div className="font-bold leading-tight text-[15px] line-clamp-2">{v.title}</div>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--muted)] tnum">
                  <span>{v.scenes} scenes</span>
                  <span>{mmss(v.durationSec)}</span>
                  <span className="ml-auto">{rel(v.updatedAt)}</span>
                </div>
              </div>
            </Link>
              {v.hasRender && (
                <a
                  href={`/api/videos/${v.slug}/file/out/${v.slug}.mp4`}
                  download={`${v.slug}.mp4`}
                  className="absolute right-3 bottom-[96px] pill gold opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ↓ MP4
                </a>
              )}
            </div>
          );
        })}
      </section>

      {shown.length === 0 && videos.length > 0 && <div className="py-16 text-center text-[var(--muted)]">Nothing matches that filter.</div>}
      <NewVideoModal templates={videos.map((v) => ({ slug: v.slug, title: v.title }))} open={open} onClose={() => setOpen(false)} />
    </main>
  );
}
