import type { Metadata } from "next";
import Link from "next/link";
import { FONT_DATA } from "@utd/video/fonts";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = { title: "UTD Gen", description: "Script in, voiced vertical video out" };

// Anton + Inter from the same embedded files the renderer uses — no network, identical look.
const fontCss = `
@font-face{font-family:'Anton';font-weight:400;font-display:swap;src:url(${FONT_DATA.anton400}) format('woff2')}
@font-face{font-family:'Inter';font-weight:400;font-display:swap;src:url(${FONT_DATA.inter400}) format('woff2')}
@font-face{font-family:'Inter';font-weight:700;font-display:swap;src:url(${FONT_DATA.inter700}) format('woff2')}
@font-face{font-family:'Inter';font-weight:900;font-display:swap;src:url(${FONT_DATA.inter900}) format('woff2')}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: fontCss }} />
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("utd-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}` }} />
      </head>
      <body className="min-h-screen">
        <header className="h-14 border-b border-[var(--line)] flex items-center px-5 gap-5 bg-[var(--surface)]">
          <Link href="/" className="display text-[26px] leading-none tracking-wide">
            UTD <span className="text-[var(--red)]">GEN</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-[var(--muted)]">
            <Link href="/" className="hover:text-[var(--fg)]">
              Videos
            </Link>
            <a href="https://github.com/Kdcode1999/udt-gen" target="_blank" rel="noreferrer" className="hover:text-[var(--fg)]">
              Repo
            </a>
          </nav>
          <span className="ml-auto text-[11px] tracking-[.14em] uppercase text-[var(--muted)] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--gold)] shadow-[0_0_10px_var(--gold)]" />
            local · videos/
          </span>
          <ThemeToggle />
        </header>
        {children}
      </body>
    </html>
  );
}
