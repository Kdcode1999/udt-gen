"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Template = { slug: string; title: string };

export function NewVideoModal({ templates, open, onClose }: { templates: Template[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/videos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim(), from: from || undefined }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "failed");
    router.push(`/v/${j.slug}`);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg grid gap-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-[11px] tracking-[.14em] uppercase text-[var(--muted)]">New video</div>
          <h2 className="display text-4xl leading-none mt-1">
            What&apos;s the <span className="text-[var(--gold)]">story</span>?
          </h2>
        </div>
        <div>
          <label>Working title</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Amorim's wing-back problem" onKeyDown={(e) => e.key === "Enter" && create()} />
          <div className="text-xs text-[var(--muted)] mt-1">Becomes the folder name: videos/{title ? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "…" : "…"}</div>
        </div>
        <div>
          <label>Start from</label>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Blank — hook + follow card</option>
            {templates.map((t) => (
              <option key={t.slug} value={t.slug}>
                Copy of “{t.title}”
              </option>
            ))}
          </select>
        </div>
        {err && <div className="text-sm text-[var(--red)]">{err}</div>}
        <div className="flex gap-2 justify-end pt-1">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-red" disabled={!title.trim() || busy} onClick={create}>
            {busy ? "Creating…" : "Create & open"}
          </button>
        </div>
      </div>
    </div>
  );
}
