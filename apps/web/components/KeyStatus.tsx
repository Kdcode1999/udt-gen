"use client";
import { useEffect, useState } from "react";

type S = { anthropic: boolean; elevenlabs: boolean; openai: boolean; youtube: boolean; model: string; overrides?: string[] };

const FIX = "add it to the .env file at the repo root (copy .env.example) and refresh the page";

export function KeyStatus() {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setS).catch(() => null);
  }, []);
  if (!s) return null;
  const over = new Set(s.overrides ?? []);
  const Chip = ({ ok, label, hint, env }: { ok: boolean; label: string; hint: string; env: string }) => {
    const warn = over.has(env);
    const title = warn ? `${env}: the window that started the app has its own value and it differs from .env — the window's value is in use. Close that window and start pnpm dev in a new one to use the file.` : hint;
    return (
      <span title={title} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold tracking-[.12em] uppercase border ${warn ? "border-[var(--gold)] text-[var(--gold)]" : ok ? "border-[var(--line)] text-[var(--muted)]" : "border-[var(--red)] text-[var(--red)]"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-[var(--gold)]" : "bg-[var(--red)]"}`} />
        {label} {warn ? "window ≠ .env" : ok ? "on" : "off"}
      </span>
    );
  };
  return (
    <span className="flex items-center gap-1.5">
      <Chip env="ELEVENLABS_API_KEY" ok={s.elevenlabs} label="voice" hint={s.elevenlabs ? "ELEVENLABS_API_KEY loaded" : `ELEVENLABS_API_KEY missing — ${FIX} (free Edge voice still works)`} />
      <Chip env="OPENAI_API_KEY" ok={s.openai} label="images" hint={s.openai ? "OPENAI_API_KEY loaded" : `OPENAI_API_KEY missing — ${FIX} (image scenes render as caption plates until then)`} />
      <Chip env="YOUTUBE_API_KEY" ok={s.youtube} label="youtube" hint={s.youtube ? "YOUTUBE_API_KEY loaded — fan comments feed the topic radar" : `YOUTUBE_API_KEY missing — ${FIX} (radar runs on Reddit + news only until then)`} />
      <Chip env="ANTHROPIC_API_KEY" ok={s.anthropic} label="ai draft" hint={s.anthropic ? `ANTHROPIC_API_KEY loaded · ${s.model}` : `ANTHROPIC_API_KEY missing — ${FIX}`} />
    </span>
  );
}
