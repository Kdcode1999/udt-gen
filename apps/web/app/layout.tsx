import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "UTD Gen", description: "Script in, voiced vertical video out" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="h-12 border-b border-[var(--line)] flex items-center px-4 gap-4 bg-[var(--surface)]">
          <Link href="/" className="font-black tracking-tight text-lg">
            UTD <span className="text-[var(--red)]">GEN</span>
          </Link>
          <span className="text-xs text-[var(--muted)]">script in · voiced 9:16 video out</span>
        </header>
        {children}
      </body>
    </html>
  );
}
