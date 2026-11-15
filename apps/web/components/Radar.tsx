"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { JobPanel, type Job } from "./JobPanel";

type Topic = {
  title: string;
  hook: string;
  heat: number;
  whyNow: string;
  angle: string;
  brief: string;
  series: string;
  sources: { title: string; url: string }[];
  signals: string;
  drafted?: { slug: string; at: string };
  kept?: boolean;
};
type Counts = { reddit: number; news: number; youtube?: number; ytComments?: number };
type Scan = { id: string; generatedAt: string; topics: Topic[]; counts: Counts };
type ScanSummary = { id: string; generatedAt: string; topics: number; drafted: number; counts: Counts };
type Kept = { key: string; scanId: string; index: number; keptAt: string; topic: Topic };
type Payload = { scans: ScanSummary[]; radar: Scan | null; kept: Kept[]; job: Job | null; configured: boolean };

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};
const when = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today ${t}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday ${t}`;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${t}`;
};

export function Radar() {
  const router = useRouter();
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [scan, setScan] = useState<Scan | null>(null);
  const [kept, setKept] = useState<Kept[]>([]);
  const [view, setView] = useState<"scan" | "kept">("scan");
  const [job, setJob] = useState<Job | null>(null);
  const [configured, setConfigured] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [length, setLength] = useState(60);
  const [err, setErr] = useState("");

  const load = useCallback(async (id?: string) => {
    const r = await fetch(`/api/radar${id ? `?scan=${encodeURIComponent(id)}` : ""}`);
    const j = (await r.json()) as Payload;
    setScans(j.scans);
    setScan(j.radar);
    setKept(j.kept);
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

  const draft = async (t: Topic, ref: { scanId: string; index: number }) => {
    const key = `${ref.scanId}:${ref.index}`;
    setStarting(key);
    setErr("");
    const r = await fetch("/api/videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: t.title, draft: true, brief: `${t.brief}\n\nAngle: ${t.angle}\nSuggested hook word: ${t.hook}`, lengthSec: length, series: t.series, radar: ref }),
    });
    const j = await r.json();
    setStarting(null);
    if (!r.ok) return setErr(j.error ?? "failed");
    router.push(`/v/${j.slug}`);
  };

  const keep = async (ref: { scanId: string; index: number } | { key: string }, on: boolean) => {
    const r = await fetch("/api/radar/keep", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ref, keep: on }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error ?? "could not save");
    setKept(j.kept);
    const keys = new Set((j.kept as Kept[]).map((k) => k.key));
    setScan((s) => (s ? { ...s, topics: s.topics.map((t, i) => ({ ...t, kept: keys.has(`${s.id}:${i}`) })) } : s));
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
          <p className="mt-3 max-w-xl text-[var(--muted)] text-sm">
            Fan comments under the big United YouTube channels, r/reddevils and r/soccer threads, the headlines behind them, plus a web check of X and TikTok — ranked by heat. Every scan is saved; ★ keeps a topic for later; pick one and it goes straight into research &amp; draft.
          </p>
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
            {busy ? "Scanning…" : scans.length ? "Scan again" : "Scan now"}
          </button>
        </div>
      </section>

      {!configured && (
        <div className="mt-4 text-sm text-[var(--red)]">
          The radar needs the Claude key. Put <code className="mono">ANTHROPIC_API_KEY=…</code> in the <code className="mono">.env</code> file at the repo root (copy <code className="mono">.env.example</code>), then refresh this page.
        </div>
      )}
      {err && <div className="mt-4 text-sm text-[var(--red)]">{err}</div>}
      <div className="mt-4">
        <JobPanel
          job={job}
          onFinished={(j) => {
            setJob(j);
            setView("scan");
            void load(); // newest scan
          }}
        />
      </div>

      {/* scan history + kept */}
      {(scans.length > 0 || kept.length > 0) && (
        <div className="mt-5 flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1" style={{ whiteSpace: "nowrap" }}>
          <span className="text-[11px] tracking-[.14em] uppercase text-[var(--muted)] mr-1">Scans</span>
          {scans.map((s) => {
            const active = view === "scan" && scan?.id === s.id;
            return (
              <button
                key={s.id}
                className={`btn !py-1 ${active ? "btn-gold" : ""}`}
                title={`${s.topics} topics${s.drafted ? ` · ${s.drafted} drafted` : ""}`}
                onClick={() => {
                  setView("scan");
                  void load(s.id);
                }}
              >
                {when(s.generatedAt)}
                {s.drafted ? <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[var(--gold)] align-middle" title={`${s.drafted} drafted`} /> : null}
              </button>
            );
          })}
          <span className="mx-1 text-[var(--line)]">|</span>
          <button className={`btn !py-1 ${view === "kept" ? "btn-gold" : ""}`} onClick={() => setView("kept")}>
            ★ Kept <span className="tnum opacity-70">{kept.length}</span>
          </button>
        </div>
      )}

      {view === "scan" && scan && (
        <>
          <div className="mt-4 text-xs text-[var(--muted)]">
            Scanned {ago(scan.generatedAt)} · {scan.counts.reddit} Reddit threads · {scan.counts.news} headlines ·{" "}
            {scan.counts.ytComments ? `${scan.counts.ytComments} YouTube comments from ${scan.counts.youtube} videos` : "YouTube off (add YOUTUBE_API_KEY to .env)"}
          </div>
          <section className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {scan.topics.map((t, i) => (
              <TopicCard key={`${scan.id}:${i}`} t={t} scanId={scan.id} index={i} starting={starting} onKeep={keep} onDraft={draft} />
            ))}
          </section>
        </>
      )}

      {view === "kept" && (
        <>
          <div className="mt-4 text-xs text-[var(--muted)]">Topics you starred. They stay here however many scans run; ★ again to drop one.</div>
          {kept.length === 0 ? (
            <div className="py-16 text-center text-[var(--muted)]">Nothing kept yet — star a topic on any scan.</div>
          ) : (
            <section className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
              {kept.map((k) => (
                <TopicCard key={k.key} t={{ ...k.topic, kept: true }} scanId={k.scanId} index={k.index} from={when(scanTime(k.scanId))} starting={starting} onKeep={keep} onDraft={draft} />
              ))}
            </section>
          )}
        </>
      )}

      {view === "scan" && !scan && !busy && configured && <div className="py-16 text-center text-[var(--muted)]">Nothing scanned yet. Press Scan now.</div>}
    </main>
  );
}

const safeHost = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** 20261115-063651 → ISO (UTC) so kept cards can say which scan they came from. */
const scanTime = (id: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(id);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : new Date(0).toISOString();
};

type CardProps = { t: Topic; scanId: string; index: number; from?: string; starting: string | null; onKeep: (ref: { scanId: string; index: number }, on: boolean) => void; onDraft: (t: Topic, ref: { scanId: string; index: number }) => void };
const TopicCard = ({ t, scanId, index, from, starting, onKeep, onDraft }: CardProps) => {
  const key = `${scanId}:${index}`;
  return (
    <article className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="display text-3xl leading-none text-[var(--gold)]">{t.hook}</div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5" title={`heat ${t.heat}/5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={`w-2 h-5 rounded-sm ${n <= t.heat ? "bg-[var(--red)]" : "bg-[var(--surface-2)]"}`} />
            ))}
          </div>
          <button
            className={`text-lg leading-none px-1 ${t.kept ? "text-[var(--gold)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}
            title={t.kept ? "Remove from kept" : "Keep this topic for later"}
            onClick={() => onKeep({ scanId, index }, !t.kept)}
          >
            {t.kept ? "★" : "☆"}
          </button>
        </div>
      </div>
      <div className="font-bold leading-tight">{t.title}</div>
      <div className="text-sm text-[var(--muted)]">{t.whyNow}</div>
      <div className="text-sm">
        <span className="text-[var(--muted)]">Angle · </span>
        {t.angle}
      </div>
      <div className="text-[11px] text-[var(--muted)] mono">
        {t.signals}
        {from ? ` · from scan ${from}` : ""}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {t.sources.slice(0, 4).map((s, k) => (
          <a key={k} href={s.url} target="_blank" rel="noreferrer" className="underline text-[var(--muted)] hover:text-[var(--fg)] truncate max-w-[220px]">
            {s.title || safeHost(s.url)}
          </a>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <span className="pill dim">{t.series}</span>
        {t.drafted ? (
          <Link href={`/v/${t.drafted.slug}`} className="btn btn-gold" title={`drafted ${ago(t.drafted.at)}`}>
            Drafted · open →
          </Link>
        ) : (
          <button className="btn btn-red" disabled={starting !== null} onClick={() => onDraft(t, { scanId, index })}>
            {starting === key ? "Starting…" : "Draft this →"}
          </button>
        )}
      </div>
    </article>
  );
};
