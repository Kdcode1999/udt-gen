"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { JobPanel, type Job } from "./JobPanel";

type Topic = { title: string; hook: string; heat: number; whyNow: string; angle: string; brief: string; series: string; sources: { title: string; url: string }[]; signals: string };
type RadarData = { generatedAt: string; topics: Topic[]; counts: { reddit: number; news: number; youtube?: number; ytComments?: number } };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export function Radar() {
  const router = useRouter();
  const [data, setData] = useState<RadarData | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [configured, setConfigured] = useState(true);
  const [starting, setStarting] = useState<number | null>(null);
  const [length, setLength] = useState(60);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/radar");
    const j = await r.json();
    setData(j.radar);
    setJob(j.job);
    setConfigured(j.configured);
  }, []);
  useEffect(() => void load(), [load]);

  const refresh = async () => {
    setErr("");
    const r = await fetch("/api/radar", { method: "POST" });
    const j = await r.json();
    if (!r.ok) return setErr(j.error ?? "could not start");
    setJob(j.job);
  };

  const draft = async (t: Topic, i: number) => {
    setStarting(i);
    setErr("");
    const r = await fetch("/api/videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: t.title, draft: true, brief: `${t.brief}\n\nAngle: ${t.angle}\nSuggested hook word: ${t.hook}`, lengthSec: length, series: t.series }),
    });
    const j = await r.json();
    setStarting(null);
    if (!r.ok) return setErr(j.error ?? "failed");
    router.push(`/v/${j.slug}`);
  };

  const busy = job?.status === "running";

  return (
    <main className="max-w-[1100px] mx-auto px-6 pb-16">
      <section className="pt-10 pb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)]">
        <div>
          <div className="text-[11px] tracking-[.16em] uppercase text-[var(--muted)]">Topic radar</div>
          <h1 className="display leading-[.92] mt-2" style={{ fontSize: "clamp(44px, 6vw, 80px)" }}>
            What the fans are <span className="text-[var(--red)]">arguing</span> about
          </h1>
          <p className="mt-3 max-w-xl text-[var(--muted)] text-sm">Fan comments under the big United YouTube channels, r/reddevils and r/soccer threads, the headlines behind them, and a look at X — ranked by heat. Pick one and it goes straight into research &amp; draft.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-[var(--muted)]">
            length
            {[45, 60, 90].map((n) => (
              <button key={n} className={`btn !py-1 ${length === n ? "btn-gold" : ""}`} onClick={() => setLength(n)}>
                {n}s
              </button>
            ))}
          </div>
          <button className="btn btn-red" disabled={busy || !configured} onClick={refresh}>
            {busy ? "Scanning…" : data ? "Refresh" : "Scan now"}
          </button>
        </div>
      </section>

      {!configured && <div className="mt-4 text-sm text-[var(--red)]">Set ANTHROPIC_API_KEY in the window that runs the app to use the radar.</div>}
      {err && <div className="mt-4 text-sm text-[var(--red)]">{err}</div>}
      <div className="mt-4">
        <JobPanel
          job={job}
          onFinished={(j) => {
            setJob(j);
            void load();
          }}
        />
      </div>

      {data && (
        <>
          <div className="mt-4 text-xs text-[var(--muted)]">
            Scanned {ago(data.generatedAt)} · {data.counts.reddit} Reddit threads · {data.counts.news} headlines · {data.counts.ytComments ? `${data.counts.ytComments} YouTube comments from ${data.counts.youtube} videos` : "YouTube off (set YOUTUBE_API_KEY)"}
          </div>
          <section className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {data.topics.map((t, i) => (
              <article key={i} className="card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="display text-3xl leading-none text-[var(--gold)]">{t.hook}</div>
                  <div className="flex gap-0.5" title={`heat ${t.heat}/5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`w-2 h-5 rounded-sm ${n <= t.heat ? "bg-[var(--red)]" : "bg-[var(--surface-2)]"}`} />
                    ))}
                  </div>
                </div>
                <div className="font-bold leading-tight">{t.title}</div>
                <div className="text-sm text-[var(--muted)]">{t.whyNow}</div>
                <div className="text-sm">
                  <span className="text-[var(--muted)]">Angle · </span>
                  {t.angle}
                </div>
                <div className="text-[11px] text-[var(--muted)] mono">{t.signals}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {t.sources.slice(0, 4).map((s, k) => (
                    <a key={k} href={s.url} target="_blank" rel="noreferrer" className="underline text-[var(--muted)] hover:text-[var(--fg)] truncate max-w-[220px]">
                      {s.title || new URL(s.url).hostname}
                    </a>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="pill dim">{t.series}</span>
                  <button className="btn btn-red" disabled={starting !== null} onClick={() => draft(t, i)}>
                    {starting === i ? "Starting…" : "Draft this →"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
      {!data && !busy && configured && <div className="py-16 text-center text-[var(--muted)]">Nothing scanned yet. Press Scan now.</div>}
    </main>
  );
}
