"use client";
import React, { useRef, useState } from "react";
import { Field } from "./fields";

export type AssetInfo = { name: string; path: string; size: number; kind: "image" | "video" | "audio" | "other"; url: string };

export const AssetPicker: React.FC<{
  label: string;
  slug: string;
  kind: AssetInfo["kind"];
  value?: string;
  assets: AssetInfo[];
  onAssets: (a: AssetInfo[]) => void;
  onChange: (path: string | undefined) => void;
  hint?: string;
}> = ({ label, slug, kind, value, assets, onAssets, onChange, hint }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const list = assets.filter((a) => a.kind === kind);
  const current = assets.find((a) => a.path === value);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("file", f);
    const r = await fetch(`/api/videos/${slug}/assets`, { method: "POST", body: fd });
    const j = await r.json();
    setBusy(false);
    if (r.ok) {
      onAssets(j.assets);
      if (j.saved?.[0]) onChange(j.saved[0].path);
    }
  };

  const accept = kind === "image" ? "image/*" : kind === "video" ? "video/*" : kind === "audio" ? "audio/*" : "*/*";

  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2 items-start">
        <div className="flex-1 grid gap-2">
          <select value={list.some((a) => a.path === value) ? value : value ? "__custom" : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "__custom" ? value : e.target.value)}>
            <option value="">— none —</option>
            {list.map((a) => (
              <option key={a.path} value={a.path}>
                {a.name} ({(a.size / 1024 / 1024).toFixed(1)} MB)
              </option>
            ))}
            {value && !list.some((a) => a.path === value) && <option value="__custom">{value}</option>}
          </select>
          <input value={value ?? ""} placeholder="assets/file.png or https://…" onChange={(e) => onChange(e.target.value || undefined)} className="mono text-xs" />
        </div>
        <button className="btn" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : "Upload"}
        </button>
        <input ref={input} type="file" accept={accept} multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>
      {current && kind === "image" && <img src={current.url} alt="" className="mt-2 h-28 rounded border border-[var(--line)] object-cover" />}
      {current && kind === "video" && <video src={current.url} className="mt-2 h-28 rounded border border-[var(--line)]" muted controls />}
      {current && kind === "audio" && <audio src={current.url} className="mt-2 w-full" controls />}
    </Field>
  );
};
