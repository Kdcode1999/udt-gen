"use client";
import React, { useState } from "react";

type Post = { title?: string; facebook?: string; description?: string; short?: string; hashtags?: string[]; commentPrompt?: string };

const Block: React.FC<{ label: string; text?: string }> = ({ label, text }) => {
  const [done, setDone] = useState(false);
  if (!text) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[.14em] text-[var(--muted)]">{label}</span>
        <button className="text-xs underline text-[var(--muted)]" onClick={copy}>
          {done ? "copied" : "copy"}
        </button>
      </div>
      <pre className="text-[12.5px] leading-relaxed whitespace-pre-wrap font-[inherit] bg-[var(--bg)] border border-[var(--line)] rounded p-2 max-h-56 overflow-auto scrollbar-thin">{text}</pre>
    </div>
  );
};

export const PostCopy: React.FC<{ post: Post; downloadUrl?: string; onRewrite: () => void; busy: boolean }> = ({ post, downloadUrl, onRewrite, busy }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="card p-3 grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <button className="text-left text-xs uppercase tracking-wider text-[var(--muted)]" onClick={() => setOpen((o) => !o)}>
          Post copy {open ? "▾" : "▸"}
        </button>
        <div className="flex gap-2">
          {downloadUrl && (
            <a className="btn !py-1 !text-xs" href={downloadUrl} download="post.txt">
              post.txt
            </a>
          )}
          <button className="btn !py-1 !text-xs" disabled={busy} onClick={onRewrite}>
            Rewrite
          </button>
        </div>
      </div>
      {open && (
        <>
          <Block label="Facebook caption" text={post.facebook} />
          <Block label="Description (detailed)" text={post.description} />
          <Block label="TikTok / Shorts" text={post.short} />
          <Block label="Hashtags" text={post.hashtags?.join(" ")} />
        </>
      )}
    </div>
  );
};
