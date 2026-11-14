"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const path = usePathname();
  const inVideo = path.startsWith("/v/");
  const slug = inVideo ? decodeURIComponent(path.split("/")[2] ?? "") : null;
  return (
    <nav className="flex items-center gap-2 text-sm">
      <Link href="/#videos" className={`px-2.5 py-1 rounded-md ${inVideo ? "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]" : "bg-[var(--surface-2)] text-[var(--fg)] font-semibold"}`}>
        Videos
      </Link>
      {slug && (
        <>
          <span className="text-[var(--muted)]">›</span>
          <span className="px-2.5 py-1 rounded-md bg-[var(--surface-2)] font-semibold mono text-xs">{slug}</span>
        </>
      )}
      <a href="https://github.com/Kdcode1999/udt-gen" target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-md text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]">
        Repo ↗
      </a>
    </nav>
  );
}
