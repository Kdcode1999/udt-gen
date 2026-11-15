"use client";
import React, { useEffect, useState } from "react";

export type Job = { id: string; slug: string; kind: "vo" | "render" | "stills" | "draft" | "images" | "post" | "radar"; status: "running" | "done" | "failed"; progress: number; startedAt: number; endedAt?: number; message: string; exitCode?: number };

const label: Record<Job["kind"], string> = { vo: "Voice", render: "Render", stills: "Stills", draft: "Draft", images: "Images", post: "Post copy", radar: "Topic scan" };

export const JobPanel: React.FC<{ job: Job | null; onFinished: (job: Job) => void }> = ({ job, onFinished }) => {
  const [live, setLive] = useState<Job | null>(job);
  const [log, setLog] = useState("");
  const [showLog, setShowLog] = useState(false);

  useEffect(() => setLive(job), [job]);

  useEffect(() => {
    if (!live || live.status !== "running") return;
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/jobs/${live.id}`);
      if (!r.ok || stop) return;
      const j = (await r.json()) as { job: Job; log: string };
      setLive(j.job);
      setLog(j.log);
      if (j.job.status !== "running") onFinished(j.job);
      else setTimeout(tick, 1500);
    };
    const t = setTimeout(tick, 1200);
    return () => {
      stop = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.id, live?.status]);

  if (!live) return null;
  const secs = Math.round(((live.endedAt ?? Date.now()) - live.startedAt) / 1000);
  const color = live.status === "failed" ? "var(--red)" : live.status === "done" ? "var(--gold)" : "var(--fg)";
  return (
    <div className="card p-3 grid gap-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold" style={{ color }}>
          {label[live.kind]} · {live.status === "running" ? "running" : live.status === "done" ? "done" : "failed"} <span className="text-[var(--muted)] font-normal">{secs}s</span>
        </div>
        <button className="text-xs underline text-[var(--muted)]" onClick={() => setShowLog((s) => !s)}>
          {showLog ? "hide log" : "log"}
        </button>
      </div>
      {live.kind === "render" && live.status === "running" && (
        <div className="h-2 rounded bg-[var(--surface-2)] overflow-hidden">
          <div className="h-full bg-[var(--gold)] transition-all" style={{ width: `${Math.round(live.progress * 100)}%` }} />
        </div>
      )}
      <div className="text-xs text-[var(--muted)] break-words">{live.message}</div>
      {showLog && <pre className="mono text-[11px] max-h-48 overflow-auto scrollbar-thin bg-[var(--bg)] border border-[var(--line)] p-2 rounded whitespace-pre-wrap">{log || "(no output yet)"}</pre>}
    </div>
  );
};
