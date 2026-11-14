import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import "./fonts";
import { getBrand, type Brand } from "./brand";
import type { Scene, Script, VoManifest } from "./schema";
import type { Timeline, TimedScene } from "./timing";
import { Captions } from "./components/Captions";
import { SafeZone, Tag, asset } from "./components/ui";
import { Board } from "./scenes/Board";
import { Hook } from "./scenes/Hook";
import { Stat } from "./scenes/Stat";
import { Quote } from "./scenes/Quote";
import { Compare } from "./scenes/Compare";
import { ImageScene, FootageScene } from "./scenes/Media";
import { Cta } from "./scenes/Cta";
import sfxWhoosh from "../assets/sfx/whoosh.mp3";
import sfxHit from "../assets/sfx/hit.mp3";
import sfxTick from "../assets/sfx/tick.mp3";
import sfxRiser from "../assets/sfx/riser.mp3";
import bedPlaceholder from "../assets/sfx/bed-placeholder.mp3";

export type VideoProps = {
  slug?: string;
  script: Script | null;
  vo: VoManifest | null;
  timeline: Timeline | null;
};

const SFX: Record<string, string> = { whoosh: sfxWhoosh, hit: sfxHit, tick: sfxTick, riser: sfxRiser };

const defaultSfx = (type: Scene["type"]): string | null => {
  switch (type) {
    case "hook":
    case "stat":
      return "hit";
    case "cta":
      return "riser";
    case "quote":
      return "tick";
    default:
      return "whoosh";
  }
};

const SceneSwitch: React.FC<{ scene: Scene; timed: TimedScene; brand: Brand }> = ({ scene, timed, brand }) => {
  switch (scene.type) {
    case "hook":
      return <Hook scene={scene} brand={brand} />;
    case "stat":
      return <Stat scene={scene} brand={brand} />;
    case "quote":
      return <Quote scene={scene} brand={brand} />;
    case "compare":
      return <Compare scene={scene} brand={brand} />;
    case "board":
      return <Board scene={scene} timed={timed} brand={brand} />;
    case "image":
      return <ImageScene scene={scene} timed={timed} brand={brand} />;
    case "footage":
      return <FootageScene scene={scene} brand={brand} />;
    case "cta":
      return <Cta scene={scene} brand={brand} />;
    default:
      return null;
  }
};

export const Video: React.FC<VideoProps> = ({ script, timeline }) => {
  if (!script || !timeline) {
    return <AbsoluteFill style={{ background: "#0A0A0C" }} />;
  }
  const brand = getBrand(script.brand);
  const capMode = script.captions?.mode ?? "chunk";
  const musicVol = script.music?.volume ?? 0.16;
  const duck = script.music?.duck ?? 0.35;
  const musicSrc = script.music?.src ? (script.music.src === "placeholder" ? bedPlaceholder : asset(script.music.src)) : null;

  // music volume: duck while any scene's voice is playing, 10-frame ramps
  const voSpans = timeline.scenes.filter((s) => s.voDuration > 0).map((s) => [s.start, s.start + s.voDuration] as const);
  const musicVolume = (f: number) => {
    let m = 1;
    for (const [a, b] of voSpans) {
      const inside = interpolate(f, [a - 10, a, b, b + 14], [1, duck, duck, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      m = Math.min(m, inside);
    }
    const tail = interpolate(f, [timeline.total - 30, timeline.total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return musicVol * m * tail;
  };

  return (
    <AbsoluteFill style={{ background: brand.colors.ink, fontFamily: brand.fonts.body }}>
      {timeline.scenes.map((timed) => {
        const scene = script.scenes[timed.index];
        const sfxName = scene.sfx === "none" ? null : scene.sfx ?? defaultSfx(scene.type);
        return (
          <Sequence key={timed.index} from={timed.start} durationInFrames={timed.duration} name={`${String(timed.index + 1).padStart(2, "0")} ${scene.type}`}>
            <SceneSwitch scene={scene} timed={timed} brand={brand} />
            {scene.type !== "cta" && <Tag brand={brand} series={script.series} />}
            {scene.captions !== false && <Captions brand={brand} words={timed.words} mode={capMode} y={script.captions?.y} />}
            {timed.audio && <Audio src={staticFile(timed.audio)} />}
            {sfxName && SFX[sfxName] && <Audio src={SFX[sfxName]} volume={0.5} />}
            {scene.type === "board" &&
              scene.steps.slice(1).map((_, i) => {
                // tick on each step change (mirrors Board's auto spacing when `at` is omitted)
                const durSec = timed.duration / timeline.fps;
                const at = scene.steps[i + 1].at ?? 0.4 + ((i + 1) * (durSec - 1.0)) / scene.steps.length;
                return (
                  <Sequence key={`tick${i}`} from={Math.round(at * timeline.fps)}>
                    <Audio src={SFX.tick} volume={0.35} />
                  </Sequence>
                );
              })}
          </Sequence>
        );
      })}
      {musicSrc && <Audio src={musicSrc} loop volume={musicVolume} />}
      {script.debug && <SafeZone />}
    </AbsoluteFill>
  );
};
