"use client";
import { useEffect, useState } from "react";

type S = { anthropic: boolean; elevenlabs: boolean; openai: boolean; youtube: boolean; model: string };

const FIX = "add it to the .env file at the repo root (copy .env.example) and refresh the page";

export function KeyStatus() {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setS).catch(() => null);
  }, []);
  if (!s) return null;
  const Chip = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => (
    <span title={hint} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold tracking-[.12em] uppercase border ${ok ? "border-[var(--line)] text-[var(--muted)]" : "border-[var(--red)] text-[var(--red)]"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-[var(--gold)]" : "bg-[var(--red)]"}`} />
      {label} {ok ? "on" : "off"}
    </span>
  );
  return (
    <span className="flex items-center gap-1.5">
      <Chip ok={s.elevenlabs} label="voice" hint={s.elevenlabs ? "ELEVENLABS_API_KEY loaded" : `ELEVENLABS_API_KEY missing — ${FIX} (free Edge voice still works)`} />
      <Chip ok={s.openai} label="images" hint={s.openai ? "OPENAI_API_KEY loaded" : `OPENAI_API_KEY missing — ${FIX} (image scenes render as caption plates until then)`} />
      <Chip ok={s.youtube} label="youtube" hint={s.youtube ? "YOUTUBE_API_KEY loaded — fan comments feed the topic radar" : `YOUTUBE_API_KEY missing — ${FIX} (radar runs on Reddit + news only until then)`} />
      <Chip ok={s.anthropic} label="ai draft" hint={s.anthropic ? `ANTHROPIC_API_KEY loaded · ${s.model}` : `ANTHROPIC_API_KEY missing — ${FIX}`} />
    </span>
  );
}
