import Link from "next/link";
import { listVideos } from "@/lib/store";
import { NewVideo } from "@/components/NewVideo";

export const dynamic = "force-dynamic";

export default function Home() {
  const videos = listVideos();
  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black">Videos</h1>
          <p className="text-sm text-[var(--muted)]">One folder per video in <span className="mono">videos/</span>. Open one, or start a new one.</p>
        </div>
        <NewVideo templates={videos.map((v) => ({ slug: v.slug, title: v.title }))} />
      </div>
      {videos.length === 0 && <div className="card p-10 text-center text-[var(--muted)]">No videos yet. Create one above.</div>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {videos.map((v) => (
          <Link key={v.slug} href={`/v/${v.slug}`} className="card overflow-hidden hover:border-[var(--gold)] transition-colors">
            <div className="aspect-[9/16] max-h-64 w-full bg-[var(--surface-2)] flex items-center justify-center overflow-hidden">
              {v.thumb ? <img src={v.thumb} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-[var(--muted)]">no render yet</span>}
            </div>
            <div className="p-3">
              <div className="font-bold leading-tight line-clamp-2">{v.title}</div>
              <div className="mt-1 text-xs text-[var(--muted)] flex gap-2 flex-wrap">
                <span className="mono">{v.slug}</span>
                <span>· {v.scenes} scenes</span>
                {v.hasVo && <span>· voiced</span>}
                {v.hasRender && <span className="text-[var(--gold)]">· rendered</span>}
                {v.invalid && <span className="text-[var(--red)]">· invalid script</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
