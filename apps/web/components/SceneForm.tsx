"use client";
import React from "react";
import type { SceneT } from "@utd/video";
import { Area, Check, Num, Row, Section, Select, Text } from "./fields";
import { AssetPicker, type AssetInfo } from "./AssetPicker";
import { BoardEditor } from "./BoardEditor";

type Props = {
  slug: string;
  scene: SceneT;
  assets: AssetInfo[];
  onAssets: (a: AssetInfo[]) => void;
  onChange: (s: SceneT) => void;
};

const SFX = ["whoosh", "hit", "tick", "riser", "none"].map((v) => ({ value: v, label: v }));

export const SceneForm: React.FC<Props> = ({ slug, scene, assets, onAssets, onChange }) => {
  // typed patch helper — keeps the discriminant intact
  const set = <K extends string>(key: K, value: unknown) => onChange({ ...scene, [key]: value } as SceneT);

  return (
    <div className="grid gap-4">
      <Section title={`${scene.type} scene`}>
        {scene.type === "hook" && (
          <>
            <Row>
              <Text label="Hook word" value={scene.word} onChange={(v) => set("word", v ?? "")} placeholder="HIJACK?" hint="one word, creates curiosity" />
              <Text label="Kicker" value={scene.kicker} onChange={(v) => set("kicker", v)} placeholder="OLD TRAFFORD · 8 NOV 2026" />
            </Row>
            <Text label="Sub line" value={scene.sub} onChange={(v) => set("sub", v)} placeholder="One sentence that sets up the story." />
            <Area label="Background picture: who or what is this about?" value={scene.bgPrompt} onChange={(v) => set("bgPrompt", v)} rows={2} placeholder="Leave empty and the system works it out from the story" hint="Images paints it with their current look" />
            <AssetPicker label="Background file" slug={slug} kind="image" value={scene.bg} assets={assets} onAssets={onAssets} onChange={(v) => set("bg", v)} hint="empty = ink + red glow" />
          </>
        )}

        {scene.type === "stat" && (
          <>
            <Text label="Context line" value={scene.context} onChange={(v) => set("context", v)} placeholder="Every Villa goal came inside the first eight minutes of a half." />
            <Row cols={4}>
              <Num label="Value" value={scene.value} onChange={(v) => set("value", v ?? 0)} step={0.1} />
              <Text label="Prefix" value={scene.prefix} onChange={(v) => set("prefix", v)} placeholder="£" />
              <Text label="Suffix" value={scene.suffix} onChange={(v) => set("suffix", v)} placeholder="%" />
              <Num label="Decimals" value={scene.decimals} onChange={(v) => set("decimals", v)} min={0} max={2} />
            </Row>
            <Row>
              <Text label="Label" value={scene.label} onChange={(v) => set("label", v ?? "")} placeholder="TACKLES · 24/25" />
              <Text label="Source" value={scene.source} onChange={(v) => set("source", v)} placeholder="Opta via Sky Sports" />
            </Row>
            <Check label="Gold card" value={scene.gold} onChange={(v) => set("gold", v)} hint="reserve for the headline stat" />
          </>
        )}

        {scene.type === "quote" && (
          <>
            <Area label="Quote" value={scene.text} onChange={(v) => set("text", v ?? "")} rows={3} />
            <Row>
              <Text label="Who" value={scene.who} onChange={(v) => set("who", v ?? "")} placeholder="Michael Carrick" />
              <Text label="Source" value={scene.source} onChange={(v) => set("source", v)} placeholder="Sky Sports · 8 Nov 2026" />
            </Row>
            <AssetPicker label="Portrait (optional)" slug={slug} kind="image" value={scene.img} assets={assets} onAssets={onAssets} onChange={(v) => set("img", v)} />
          </>
        )}

        {scene.type === "compare" && (
          <>
            <Text label="Title" value={scene.title} onChange={(v) => set("title", v)} placeholder="AFTER TEN GAMES" />
            <Row>
              <Text label="Left name" value={scene.left.name} onChange={(v) => set("left", { ...scene.left, name: v ?? "" })} />
              <Text label="Right name" value={scene.right.name} onChange={(v) => set("right", { ...scene.right, name: v ?? "" })} />
              <Text label="Left sub" value={scene.left.sub} onChange={(v) => set("left", { ...scene.left, sub: v })} placeholder="18th" />
              <Text label="Right sub" value={scene.right.sub} onChange={(v) => set("right", { ...scene.right, sub: v })} placeholder="10th" />
            </Row>
            <div className="grid gap-2">
              <label>Rows (max 6)</label>
              {scene.rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_80px_auto_auto] gap-2 items-center">
                  <input value={r.label} placeholder="Points" onChange={(e) => set("rows", scene.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input type="number" value={r.left} onChange={(e) => set("rows", scene.rows.map((x, j) => (j === i ? { ...x, left: Number(e.target.value) } : x)))} />
                  <input type="number" value={r.right} onChange={(e) => set("rows", scene.rows.map((x, j) => (j === i ? { ...x, right: Number(e.target.value) } : x)))} />
                  <Check label="lower wins" value={r.lowerIsBetter} onChange={(v) => set("rows", scene.rows.map((x, j) => (j === i ? { ...x, lowerIsBetter: v } : x)))} />
                  <button className="btn" onClick={() => set("rows", scene.rows.filter((_, j) => j !== i))} disabled={scene.rows.length <= 1}>
                    ✕
                  </button>
                </div>
              ))}
              {scene.rows.length < 6 && (
                <button className="btn w-fit" onClick={() => set("rows", [...scene.rows, { label: "", left: 0, right: 0 }])}>
                  + row
                </button>
              )}
            </div>
            <Text label="Source" value={scene.source} onChange={(v) => set("source", v)} />
          </>
        )}

        {scene.type === "image" && (
          <>
            <Area label="Generate: what should the picture show?" value={scene.prompt} onChange={(v) => set("prompt", v)} rows={2} placeholder="e.g. Old Trafford under floodlights in the rain, empty away end" hint="press Images (top right) to paint it; or upload your own below" />
            <Row cols={3}>
              <Select label="Style" value={scene.style} onChange={(v) => set("style", v)} options={[{ value: "plate", label: "cinematic plate" }, { value: "sketch", label: "ink sketch" }, { value: "photo", label: "photo-real" }]} allowEmpty="cinematic plate (default)" />
            </Row>
            <AssetPicker label="Image file" slug={slug} kind="image" value={scene.src} assets={assets} onAssets={onAssets} onChange={(v) => set("src", v ?? "")} hint="empty = renders a caption plate" />
            <Row>
              <Text label="Caption" value={scene.caption} onChange={(v) => set("caption", v)} placeholder="NO LEAGUE WIN SINCE AUGUST" />
              <Text label="Source" value={scene.source} onChange={(v) => set("source", v)} placeholder="Photo: …" />
              <Select label="Motion" value={scene.kenburns} onChange={(v) => set("kenburns", v)} options={["in", "out", "left", "right", "none"].map((v) => ({ value: v, label: v }))} allowEmpty="in (default)" />
              <Select label="Fit" value={scene.fit} onChange={(v) => set("fit", v)} options={[{ value: "cover", label: "cover" }, { value: "contain", label: "contain" }]} allowEmpty="cover (default)" />
            </Row>
          </>
        )}

        {scene.type === "footage" && (
          <>
            <AssetPicker label="Clip" slug={slug} kind="video" value={scene.src} assets={assets} onAssets={onAssets} onChange={(v) => set("src", v ?? "")} hint="your own footage or stock — not broadcast" />
            <Row cols={4}>
              <Num label="From (s)" value={scene.from} onChange={(v) => set("from", v)} step={0.1} min={0} />
              <Num label="To (s)" value={scene.to} onChange={(v) => set("to", v)} step={0.1} min={0} />
              <Num label="Speed" value={scene.playbackRate} onChange={(v) => set("playbackRate", v)} step={0.1} min={0.1} placeholder="1" />
              <Num label="Clip volume" value={scene.volume} onChange={(v) => set("volume", v)} step={0.05} min={0} max={1} placeholder="0.6" />
            </Row>
            <Row>
              <Text label="Label pill" value={scene.label} onChange={(v) => set("label", v)} placeholder="VS BRENTFORD · OCT 2026" />
              <Text label="Caption" value={scene.caption} onChange={(v) => set("caption", v)} />
            </Row>
            <Check label="Mute clip audio" value={scene.muted ?? true} onChange={(v) => set("muted", v ? undefined : false)} hint="voice-over runs on top" />
          </>
        )}

        {scene.type === "cta" && (
          <Row>
            <Text label="Line" value={scene.line} onChange={(v) => set("line", v)} placeholder="Follow for the full breakdown" />
            <Text label="Small print" value={scene.sub} onChange={(v) => set("sub", v)} placeholder="@utddiaries · Reels · TikTok · Shorts" />
          </Row>
        )}

        {scene.type === "board" && <BoardEditor slug={slug} scene={scene} assets={assets} onAssets={onAssets} onChange={onChange} />}
      </Section>

      <Section title="Voice-over & timing">
        <Area label="Voice-over line" value={scene.vo} onChange={(v) => set("vo", v)} rows={3} placeholder="What the voice says over this scene. Conviction and reasoning, not a readout." hint={scene.vo ? `${scene.vo.length} chars` : undefined} />
        <Row cols={4}>
          <Num label="Min length (s)" value={scene.duration} onChange={(v) => set("duration", v)} step={0.5} min={0.5} placeholder="auto" />
          <Num label="Hold after VO (s)" value={scene.hold} onChange={(v) => set("hold", v)} step={0.5} min={0} placeholder="0" />
          <Select label="SFX at start" value={scene.sfx} onChange={(v) => set("sfx", v)} options={SFX} allowEmpty="default" />
          <div className="pt-6">
            <Check label="Show captions" value={scene.captions !== false} onChange={(v) => set("captions", v ? undefined : false)} />
          </div>
        </Row>
      </Section>
    </div>
  );
};
