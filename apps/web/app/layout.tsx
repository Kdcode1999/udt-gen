import type { Metadata } from "next";
import Link from "next/link";
import { FONT_DATA } from "@utd/video/fonts";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Nav } from "@/components/Nav";
import { KeyStatus } from "@/components/KeyStatus";
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
          <Nav />
          <span className="ml-auto flex items-center gap-3">
            <KeyStatus />
          </span>
          <ThemeToggle />
        </header>
        {children}
      </body>
    </html>
  );
}
