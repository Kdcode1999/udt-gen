// Scan history for the topic radar. Every scan is saved as its own file under videos/.radar/scans/
// (next to the videos, so it persists like everything else), topics you start a draft from are marked
// with the video they became, and ★ Keep copies a topic into videos/.radar/kept.json so it outlives the scan.
import fs from "node:fs";
import path from "node:path";
import { VIDEOS_DIR } from "./store";
import type { Radar, RadarTopic } from "./radar";

export type DraftMark = { slug: string; at: string };
export type Scan = Radar & { id: string };
export type ScanSummary = { id: string; generatedAt: string; topics: number; drafted: number; counts: Radar["counts"] };
export type TopicRef = { scanId: string; index: number };
export type KeptTopic = { key: string; scanId: string; index: number; keptAt: string; topic: RadarTopic };

const DIR = path.join(VIDEOS_DIR, ".radar");
const SCANS = path.join(DIR, "scans");
const KEPT = path.join(DIR, "kept.json");
const LEGACY = path.join(VIDEOS_DIR, ".radar.json"); // single-slot cache from before history existed
const MAX_SCANS = 60; // ~10 KB each; kept topics are copied out, so pruning old scans loses nothing you kept

const ID = /^\d{8}-\d{6}[a-z]?$/;
export const isScanId = (s: unknown): s is string => typeof s === "string" && ID.test(s);
const idFor = (iso: string) => iso.replace(/\.\d+Z$/, "").replace(/[-:]/g, "").replace("T", "-"); // 2026-11-15T06:36:51Z → 20261115-063651
const file = (id: string) => path.join(SCANS, `${id}.json`);
const keyOf = (ref: TopicRef) => `${ref.scanId}:${ref.index}`;

const readJson = <T>(p: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
};
const writeJson = (p: string, v: unknown) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
};

/** Make the folders and pull the old single-file cache into the history once. */
const ensure = () => {
  fs.mkdirSync(SCANS, { recursive: true });
  if (fs.existsSync(LEGACY)) {
    const old = readJson<Radar | null>(LEGACY, null);
    if (old?.generatedAt && Array.isArray(old.topics)) {
      const id = idFor(old.generatedAt);
      if (!fs.existsSync(file(id))) writeJson(file(id), { ...old, id });
    }
    try {
      fs.unlinkSync(LEGACY);
    } catch {
      /* read-only? leave it */
    }
  }
};

const scanIds = (): string[] => {
  ensure();
  return fs
    .readdirSync(SCANS)
    .filter((f) => f.endsWith(".json") && ID.test(f.slice(0, -5)))
    .map((f) => f.slice(0, -5))
    .sort()
    .reverse(); // ids sort by time, newest first
};

const readKept = (): KeptTopic[] => readJson<KeptTopic[]>(KEPT, []).filter((k) => k && k.key && k.topic);
const withKept = (scan: Scan): Scan => {
  const kept = new Set(readKept().map((k) => k.key));
  return { ...scan, topics: scan.topics.map((t, i) => ({ ...t, kept: kept.has(keyOf({ scanId: scan.id, index: i })) })) };
};

/** Save a finished scan as the newest entry; prunes beyond MAX_SCANS. */
export const saveScan = (radar: Radar): Scan => {
  ensure();
  let id = idFor(radar.generatedAt);
  for (const suffix of ["", "b", "c", "d"]) {
    if (!fs.existsSync(file(id + suffix))) {
      id += suffix;
      break;
    }
  }
  const scan: Scan = { ...radar, id };
  writeJson(file(id), scan);
  for (const old of scanIds().slice(MAX_SCANS)) {
    try {
      fs.unlinkSync(file(old));
    } catch {
      /* ignore */
    }
  }
  return scan;
};

export const listScans = (): ScanSummary[] =>
  scanIds()
    .map((id) => {
      const s = readJson<Scan | null>(file(id), null);
      if (!s) return null;
      return { id, generatedAt: s.generatedAt, topics: s.topics.length, drafted: s.topics.filter((t) => t.drafted).length, counts: s.counts };
    })
    .filter((s): s is ScanSummary => !!s);

/** One scan by id, or the newest when no id is given. Topics carry `kept` and `drafted`. */
export const readScan = (id?: string | null): Scan | null => {
  const want = id && isScanId(id) ? id : scanIds()[0];
  if (!want) return null;
  const s = readJson<Scan | null>(file(want), null);
  return s ? withKept({ ...s, id: want }) : null;
};

const topicAt = (ref: TopicRef): { scan: Scan; topic: RadarTopic } | null => {
  if (!isScanId(ref.scanId) || !Number.isInteger(ref.index) || ref.index < 0) return null;
  const scan = readJson<Scan | null>(file(ref.scanId), null);
  const topic = scan?.topics[ref.index];
  return scan && topic ? { scan: { ...scan, id: ref.scanId }, topic } : null;
};

/** Remember that a video was started from this topic (shown as "Drafted → open" on the card). */
export const markDrafted = (ref: TopicRef, slug: string): void => {
  const hit = topicAt(ref);
  if (!hit) return;
  const mark: DraftMark = { slug, at: new Date().toISOString() };
  hit.scan.topics[ref.index] = { ...hit.topic, drafted: mark };
  writeJson(file(ref.scanId), hit.scan);
  const kept = readKept();
  const k = kept.find((x) => x.key === keyOf(ref));
  if (k) {
    k.topic = { ...k.topic, drafted: mark };
    writeJson(KEPT, kept);
  }
};

export const listKept = (): KeptTopic[] => {
  ensure();
  return readKept().sort((a, b) => (a.keptAt < b.keptAt ? 1 : -1));
};

/** ★ on / off. Removal also accepts a bare key, so a kept topic whose scan was pruned can still be dropped. */
export const setKept = (ref: TopicRef | { key: string }, keep: boolean): KeptTopic[] => {
  ensure();
  const key = "key" in ref ? ref.key : keyOf(ref);
  let kept = readKept().filter((k) => k.key !== key);
  if (keep && !("key" in ref)) {
    const hit = topicAt(ref);
    if (hit) kept = [{ key, scanId: ref.scanId, index: ref.index, keptAt: new Date().toISOString(), topic: hit.topic }, ...kept];
  }
  writeJson(KEPT, kept);
  return kept.sort((a, b) => (a.keptAt < b.keptAt ? 1 : -1));
};
