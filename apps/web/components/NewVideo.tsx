"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewVideo({ templates }: { templates: { slug: string; title: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const create = async () => {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/videos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, from: from || undefined }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "failed");
    router.push(`/v/${j.slug}`);
  };

  if (!open)
    return (
      <button className="btn btn-red" onClick={() => setOpen(true)}>
        + New video
      </button>
    );
  return (
    <div className="card p-4 w-full max-w-md grid gap-3">
      <div>
        <label>Title</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Amorim's wing-back problem" onKeyDown={(e) => e.key === "Enter" && title && create()} />
      </div>
      <div>
        <label>Start from</label>
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">Blank (hook + CTA)</option>
          {templates.map((t) => (
            <option key={t.slug} value={t.slug}>
              Copy of “{t.title}”
            </option>
          ))}
        </select>
      </div>
      {err && <div className="text-sm text-[var(--red)]">{err}</div>}
      <div className="flex gap-2 justify-end">
        <button className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn btn-red" disabled={!title.trim() || busy} onClick={create}>
          Create
        </button>
      </div>
    </div>
  );
}
