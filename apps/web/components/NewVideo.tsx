"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Template = { slug: string; title: string };

export function NewVideoModal({ templates, open, onClose }: { templates: Template[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [lengthSec, setLengthSec] = useState(60);
  const [series, setSeries] = useState("");
  const [mode, setMode] = useState<"draft" | "blank" | "copy">("draft");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ai, setAi] = useState<{ configured: boolean; model: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/videos/_/draft")
      .then((r) => r.json())
      .then((j) => {
        setAi(j);
        if (!j.configured) setMode("blank");
      })
      .catch(() => setAi({ configured: false, model: "" }));
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), from: mode === "copy" ? from || undefined : undefined, draft: mode === "draft", brief, lengthSec, series: series || undefined }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "failed");
    router.push(`/v/${j.slug}`);
  };

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card p-6 w-full max-w-2xl grid gap-4 max-h-[92vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-[11px] tracking-[.14em] uppercase text-[var(--muted)]">New video</div>
          <h2 className="display text-4xl leading-none mt-1">
            What&apos;s the <span className="text-[var(--gold)]">story</span>?
          </h2>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_200px]">
          <div>
            <label>Working title</label>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Why United keep conceding early" />
            <div className="text-xs text-[var(--muted)] mt-1">folder: videos/{slug || "…"}</div>
          </div>
          <div>
            <label>Series tag</label>
            <input value={series} onChange={(e) => setSeries(e.target.value)} placeholder="MATCH DIARY" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["draft", "Draft with AI", ai?.configured ? `Claude researches it live and writes every scene (${ai.model})` : "Add ANTHROPIC_API_KEY to the .env file to enable"],
              ["blank", "Blank", "Hook + follow card, you write the rest"],
              ["copy", "Copy", "Start from an existing video"],
            ] as const
          ).map(([m, name, desc]) => (
            <button
              key={m}
              disabled={m === "draft" && ai !== null && !ai.configured}
              onClick={() => setMode(m)}
              className={`text-left p-3 rounded-lg border ${mode === m ? "border-[var(--gold)] bg-[rgba(244,192,78,.08)]" : "border-[var(--line)] hover:border-[var(--muted)]"} disabled:opacity-40`}
            >
              <div className="font-bold text-sm">{name}</div>
              <div className="text-xs text-[var(--muted)] mt-1">{desc}</div>
            </button>
          ))}
        </div>

        {mode === "draft" && (
          <>
            <div>
              <label>Brief</label>
              <textarea
                rows={5}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder={"Topic, angle, anything you already know. e.g.\nUnited conceded four at home to Villa on 8 Nov. Angle: all four came in the first eight minutes of a half — the restart problem. Carrick called them avoidable. Make the tactical case, end on the table position."}
              />
              <div className="text-xs text-[var(--muted)] mt-1">Facts get verified by web search and labelled CONFIRMED / AGREED / RUMOUR / TARGET in the research notes. You still check them before voicing.</div>
            </div>
            <div className="flex items-center gap-3">
              <label className="!mb-0">Length</label>
              {[45, 60, 90, 120].map((n) => (
                <button key={n} className={`btn !py-1 ${lengthSec === n ? "btn-gold" : ""}`} onClick={() => setLengthSec(n)}>
                  {n}s
                </button>
              ))}
            </div>
          </>
        )}

        {mode === "copy" && (
          <div>
            <label>Copy from</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">— choose —</option>
              {templates.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {err && <div className="text-sm text-[var(--red)]">{err}</div>}
        <div className="flex gap-2 justify-end pt-1">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-red" disabled={!title.trim() || busy || (mode === "copy" && !from)} onClick={create}>
            {busy ? "Creating…" : mode === "draft" ? "Research & draft" : "Create & open"}
          </button>
        </div>
      </div>
    </div>
  );
}
