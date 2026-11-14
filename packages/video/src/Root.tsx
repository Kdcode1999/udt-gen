import React from "react";
import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";
import { Video, type VideoProps } from "./Video";
import { Script, VoManifest } from "./schema";
import { buildTimeline } from "./timing";
import { FPS, HEIGHT, WIDTH } from "./brand";

const fetchJson = async (url: string): Promise<unknown | null> => {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

/**
 * Resolves the script + VO manifest and derives the composition length.
 * The CLI passes `script`/`vo` as inputProps; the Studio reads them from the
 * public dir (videos/<slug>/script.json and vo/manifest.json).
 */
export const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ props }) => {
  const rawScript = props.script ?? (await fetchJson(staticFile("script.json")));
  if (!rawScript) {
    return { durationInFrames: FPS * 3, props: { ...props, script: null, vo: null, timeline: null } };
  }
  const script = Script.parse(rawScript);
  const rawVo = props.vo ?? (await fetchJson(staticFile("vo/manifest.json")));
  const vo = rawVo ? VoManifest.parse(rawVo) : null;
  const timeline = buildTimeline(script, vo, FPS);
  return {
    durationInFrames: Math.max(1, timeline.total),
    props: { ...props, script, vo, timeline },
  };
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="UTDVideo"
    component={Video}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={FPS * 3}
    defaultProps={{ slug: undefined, script: null, vo: null, timeline: null }}
    calculateMetadata={calculateMetadata}
  />
);
