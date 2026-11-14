"use client";
import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Video, Script, buildTimeline, setAssetBase, FPS, HEIGHT, WIDTH, type ScriptT, type VoManifestT, type Timeline } from "@utd/video";

export type PreviewProps = { slug: string; script: unknown; vo: VoManifestT | null; onTimeline?: (t: Timeline | null) => void };

/** Live preview with the real composition. Invalid scripts keep the last valid frame. */
export const Preview = forwardRef<PlayerRef, PreviewProps>(function Preview({ slug, script, vo, onTimeline }, ref) {
  useEffect(() => setAssetBase(`/api/videos/${slug}/file`), [slug]);
  // the Player is browser-only: rendering it on the server produces a different frame and a hydration warning
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const parsed = useMemo(() => {
    const r = Script.safeParse(script);
    return r.success ? (r.data as ScriptT) : null;
  }, [script]);

  const timeline = useMemo(() => (parsed ? buildTimeline(parsed, vo, FPS) : null), [parsed, vo]);
  useEffect(() => onTimeline?.(timeline), [timeline, onTimeline]);

  if (!mounted) {
    return <div className="aspect-[9/16] w-full flex-none rounded-lg bg-[#0A0A0C]" />;
  }
  if (!parsed || !timeline) {
    return <div className="aspect-[9/16] w-full flex-none rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-sm text-[var(--muted)] p-4 text-center">Fix the highlighted fields to preview.</div>;
  }

  return (
    <div style={{ width: "100%", aspectRatio: "9 / 16", position: "relative", flex: "none" }}>
      <Player
      ref={ref}
      component={Video}
      inputProps={{ slug, script: parsed, vo, timeline }}
      durationInFrames={Math.max(1, timeline.total)}
      compositionWidth={WIDTH}
      compositionHeight={HEIGHT}
      fps={FPS}
      initialFrame={Math.min(20, Math.max(0, timeline.total - 1))}
      numberOfSharedAudioTags={24}
      controls
      clickToPlay
      doubleClickToFullscreen
      spaceKeyToPlayOrPause
      style={{ width: "100%", height: "100%", borderRadius: 10, overflow: "hidden", background: "#0A0A0C" }}
      acknowledgeRemotionLicense
      />
    </div>
  );
});
