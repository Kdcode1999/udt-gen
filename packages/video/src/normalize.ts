// Turns a script the way an AI (or a hurried human) wrote it into one the schema accepts, without
// asking anyone to "fix the JSON": nulls go, "72" becomes 72, enums are lower-cased and synonyms mapped,
// array/record mix-ups are converted, ranges clamped, missing bits inferred (a player's team from its
// id, a hook word from the title). A scene that still cannot be used is shown as a picture with the same
// voice line rather than failing the whole video. Pure functions — safe in the browser, the app and the CLI.
import { Scene, Script, type Scene as SceneT, type Script as ScriptT } from "./schema";

export type NormalizeResult = { script: ScriptT; notes: string[] };
export type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Number from a number or a numeric-ish string ("£72m" → 72, "4.5s" → 4.5, "1,234" → 1234). */
export const num = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const m = v.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return undefined;
};
const str = (v: unknown): string | undefined => {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join(" ").trim() || undefined;
  return undefined;
};
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : v === "true" || v === "yes" ? true : v === "false" || v === "no" ? false : undefined);
const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], map: Record<string, T> = {}): T | undefined => {
  const l = lower(v);
  if (!l) return undefined;
  if ((allowed as readonly string[]).includes(l)) return l as T;
  return map[l];
};
const first = <T>(...vals: (T | undefined)[]) => vals.find((v) => v !== undefined);
const point = (v: unknown): { x: number; y: number } | undefined => {
  if (Array.isArray(v) && v.length >= 2) return point({ x: v[0], y: v[1] });
  if (!isObj(v)) return undefined;
  const x = num(v.x), y = num(v.y);
  return x === undefined || y === undefined ? undefined : { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
};
const set = (o: Raw, k: string, v: unknown) => {
  if (v === undefined) delete o[k];
  else o[k] = v;
};

/** Remove null/undefined everywhere — the schema never wants a null, an absent key means the same thing. */
export const stripNulls = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.filter((x) => x != null).map(stripNulls);
  if (isObj(v)) return Object.fromEntries(Object.entries(v).filter(([, x]) => x != null).map(([k, x]) => [k, stripNulls(x)]));
  return v;
};

const TYPES = ["hook", "stat", "quote", "compare", "board", "image", "footage", "cta"] as const;
const TYPE_MAP: Record<string, (typeof TYPES)[number]> = {
  tactical: "board", tactics: "board", tactic: "board", pitch: "board", formation: "board", shape: "board", "tactical board": "board",
  statistic: "stat", statistics: "stat", stats: "stat", number: "stat", metric: "stat", figure: "stat", "stat card": "stat",
  comparison: "compare", versus: "compare", vs: "compare", "head to head": "compare", h2h: "compare",
  picture: "image", photo: "image", illustration: "image", plate: "image", sketch: "image", img: "image", visual: "image", hero: "image",
  video: "footage", clip: "footage",
  outro: "cta", end: "cta", ending: "cta", follow: "cta", subscribe: "cta", close: "cta", "call to action": "cta",
  intro: "hook", title: "hook", opening: "hook", open: "hook", cold_open: "hook", "cold open": "hook",
  quotes: "quote", quotation: "quote", soundbite: "quote",
};

const inferType = (s: Raw): (typeof TYPES)[number] | undefined => {
  if (s.word !== undefined || s.bgPrompt !== undefined) return "hook";
  if (Array.isArray(s.rows) || (isObj(s.left) && isObj(s.right))) return "compare";
  if (s.players !== undefined || s.steps !== undefined) return "board";
  if (s.text !== undefined && (s.who !== undefined || s.author !== undefined || s.speaker !== undefined)) return "quote";
  if (s.value !== undefined && (s.label !== undefined || s.context !== undefined)) return "stat";
  if (s.line !== undefined && Object.keys(s).length <= 4) return "cta";
  if (s.prompt !== undefined || s.caption !== undefined || s.src !== undefined) return "image";
  return undefined;
};

const SFX = ["whoosh", "hit", "tick", "riser", "none"] as const;
const SFX_MAP = { swoosh: "whoosh", swish: "whoosh", impact: "hit", boom: "hit", thud: "hit", click: "tick", blip: "tick", rise: "riser", build: "riser", "": "none", off: "none", null: "none" } as Record<string, (typeof SFX)[number]>;
const STYLE = ["plate", "sketch", "photo"] as const;
const STYLE_MAP = { photograph: "photo", photographic: "photo", realistic: "photo", realism: "photo", press: "photo", illustration: "plate", painting: "plate", painterly: "plate", cinematic: "plate", ink: "sketch", drawing: "sketch", portrait: "sketch", "pen and ink": "sketch" } as Record<string, (typeof STYLE)[number]>;

const visuals = (v: unknown): Raw[] | undefined => {
  const list = Array.isArray(v) ? v : isObj(v) ? [v] : [];
  const out: Raw[] = [];
  for (const item of list) {
    if (!isObj(item)) continue;
    const o: Raw = {};
    set(o, "cue", str(item.cue ?? item.word ?? item.on));
    set(o, "at", (() => { const n = num(item.at ?? item.time); return n === undefined ? undefined : Math.max(0, n); })());
    set(o, "prompt", str(item.prompt ?? item.description ?? item.image));
    set(o, "style", oneOf(item.style, STYLE, STYLE_MAP));
    set(o, "person", str(item.person));
    set(o, "src", str(item.src ?? item.file));
    set(o, "auto", bool(item.auto));
    if (o.prompt || o.src) out.push(o);
  }
  return out.length ? out.slice(0, 6) : undefined;
};

/** Fields every scene shares. */
const base = (s: Raw, o: Raw) => {
  set(o, "id", str(s.id));
  set(o, "vo", str(s.vo ?? s.voiceover ?? s.voice_over ?? s.narration ?? s.script ?? s.line_vo));
  const d = num(s.duration);
  set(o, "duration", d !== undefined && d > 0 ? d : undefined);
  const h = num(s.hold);
  set(o, "hold", h !== undefined ? Math.max(0, h) : undefined);
  set(o, "sfx", oneOf(s.sfx ?? s.sound, SFX, SFX_MAP));
  set(o, "captions", typeof s.captions === "boolean" ? s.captions : bool(s.captions));
  set(o, "visuals", visuals(s.visuals ?? s.pictures ?? s.images));
};

const PLAYER_ID = /^([ha])[_-]/i;
const teamOf = (v: unknown, id: string | undefined, idx: number): "home" | "away" => {
  const l = lower(v);
  if (l) {
    if (/^(home|h|united|man ?utd|manchester united|mufc|us|ours)$/.test(l)) return "home";
    if (/^(away|a|opp|opponent|opposition|them|theirs)$/.test(l) || l.length > 1) return "away"; // any other club name = the opposition
  }
  const m = id ? PLAYER_ID.exec(id) : null;
  if (m) return m[1].toLowerCase() === "h" ? "home" : "away";
  return idx < 11 ? "home" : "away";
};

const players = (v: unknown): Raw[] => {
  const list: Raw[] = Array.isArray(v) ? v.filter(isObj) : isObj(v) ? Object.entries(v).map(([id, p]) => (isObj(p) ? { id, ...p } : { id })) : [];
  const scaleUp = list.length > 0 && list.every((p) => (num(p.x) ?? 0) <= 1 && (num(p.y) ?? 0) <= 1); // 0–1 coordinates → 0–100
  const out: Raw[] = [];
  list.forEach((p, i) => {
    const id = str(p.id ?? p.key) ?? `p${i + 1}`;
    const pt = point(scaleUp ? { x: (num(p.x) ?? 0) * 100, y: (num(p.y) ?? 0) * 100 } : p);
    if (!pt) return;
    const o: Raw = { id, team: teamOf(p.team ?? p.side, id, i), x: pt.x, y: pt.y };
    set(o, "name", str(p.name ?? p.surname));
    set(o, "number", typeof p.number === "number" ? p.number : str(p.number));
    out.push(o);
  });
  return out;
};

const ref = (v: unknown): unknown => (typeof v === "string" ? v.trim() || undefined : point(v));

const steps = (v: unknown, ids: Set<string>): Raw[] => {
  const list = Array.isArray(v) ? v.filter(isObj) : isObj(v) ? [v] : [];
  const out: Raw[] = [];
  for (const s of list) {
    const o: Raw = {};
    const at = num(s.at ?? s.time ?? s.t);
    set(o, "at", at !== undefined ? Math.max(0, at) : undefined);
    set(o, "label", str(s.label ?? s.title ?? s.text));
    const moves: Raw = {};
    const mv = s.players ?? s.moves ?? s.move;
    if (Array.isArray(mv)) for (const m of mv) if (isObj(m) && typeof m.id === "string") { const pt = point(m); if (pt) moves[m.id] = pt; }
    else if (isObj(mv)) for (const [id, p] of Object.entries(mv)) { const pt = point(p); if (pt) moves[id] = pt; }
    if (Object.keys(moves).length) o.players = moves;
    set(o, "ball", point(s.ball));
    const lines = (Array.isArray(s.lines) ? s.lines : []).filter(isObj).map((l) => { const a = str(l.from), b = str(l.to); if (!a || !b) return null; const o2: Raw = { from: a, to: b }; set(o2, "color", oneOf(l.color, ["red", "white", "gold"] as const, { yellow: "gold", grey: "white", gray: "white" })); return o2; }).filter((x): x is Raw => !!x);
    if (lines.length) o.lines = lines;
    const arrows = (Array.isArray(s.arrows) ? s.arrows : []).filter(isObj).map((a) => { const f = ref(a.from), t = ref(a.to); if (f === undefined || t === undefined) return null; const o2: Raw = { from: f, to: t }; set(o2, "style", oneOf(a.style ?? a.type, ["pass", "run", "key", "press"] as const, { dribble: "run", carry: "run", movement: "run", "run in behind": "run", "off the ball": "run", shot: "key", goal: "key", decisive: "key", "key pass": "key", assist: "key", pressing: "press", pressure: "press", "press trigger": "press", cross: "pass", through: "pass", "through ball": "pass", "long ball": "pass", switch: "pass" })); const c = num(a.curve); set(o2, "curve", c === undefined ? undefined : clamp(c, -1, 1)); return o2; }).filter((x): x is Raw => !!x);
    if (arrows.length) o.arrows = arrows;
    const hl = typeof s.highlight === "string" ? [s.highlight] : Array.isArray(s.highlight) ? s.highlight.filter((x): x is string => typeof x === "string") : [];
    if (hl.length) o.highlight = hl;
    if (isObj(s.zone)) { const x = num(s.zone.x), y = num(s.zone.y); let rx = num(s.zone.rx ?? s.zone.w ?? s.zone.r), ry = num(s.zone.ry ?? s.zone.h ?? s.zone.r); rx ??= ry; ry ??= rx; if (x !== undefined && y !== undefined && rx !== undefined && ry !== undefined) { const z: Raw = { x, y, rx: Math.abs(rx) || 8, ry: Math.abs(ry) || 6 }; set(z, "label", str(s.zone.label)); o.zone = z; } }
    if (isObj(s.zoom)) { const x = num(s.zoom.x), y = num(s.zoom.y), sc = num(s.zoom.scale ?? s.zoom.level); if (x !== undefined && y !== undefined) o.zoom = { x, y, scale: clamp(sc ?? 1.3, 1, 3) }; }
    // moves/lines/arrows/highlights that mention players which do not exist cannot draw — drop just those
    if (o.players) o.players = Object.fromEntries(Object.entries(o.players as Raw).filter(([id]) => ids.has(id)));
    if (o.players && !Object.keys(o.players as Raw).length) delete o.players;
    if (o.lines) o.lines = (o.lines as Raw[]).filter((l) => ids.has(l.from as string) && ids.has(l.to as string));
    if (o.arrows) o.arrows = (o.arrows as Raw[]).filter((a) => (typeof a.from !== "string" || ids.has(a.from)) && (typeof a.to !== "string" || ids.has(a.to)));
    if (o.highlight) o.highlight = (o.highlight as string[]).filter((id) => ids.has(id));
    for (const k of ["lines", "arrows", "highlight"]) if (Array.isArray(o[k]) && !(o[k] as unknown[]).length) delete o[k];
    out.push(o);
  }
  return out.length ? out : [{}];
};

/** One scene → a schema-shaped object (not yet validated). */
export const normalizeScene = (input: unknown, index: number): Raw | null => {
  if (!isObj(input)) return null;
  const s = stripNulls(input) as Raw;
  const type = oneOf(s.type ?? s.kind ?? s.scene, TYPES, TYPE_MAP) ?? inferType(s);
  if (!type) return null;
  const o: Raw = { type };
  base(s, o);
  switch (type) {
    case "hook": {
      const word = str(s.word ?? s.hook ?? s.headline ?? s.title);
      set(o, "word", word ? word.toUpperCase() : undefined);
      set(o, "kicker", str(s.kicker ?? s.eyebrow));
      set(o, "sub", str(s.sub ?? s.subtitle ?? s.subline));
      set(o, "bg", str(s.bg ?? s.background));
      set(o, "bgPrompt", str(s.bgPrompt ?? s.prompt ?? s.bg_prompt));
      set(o, "bgPerson", str(s.bgPerson ?? s.person));
      set(o, "bgAuto", bool(s.bgAuto));
      break;
    }
    case "stat": {
      let value = num(s.value ?? s.number ?? s.stat);
      // "£72m" / "87%" as a string: keep the symbols as prefix/suffix
      if (typeof s.value === "string" && value !== undefined) {
        const m = /^\s*([^\d\-.]*)\s*-?[\d,]*\.?\d*\s*([^\d]*?)\s*$/.exec(s.value);
        if (m) {
          if (m[1] && !s.prefix) s.prefix = m[1].trim();
          if (m[2] && !s.suffix) s.suffix = m[2].trim();
        }
      }
      set(o, "value", value);
      set(o, "label", str(s.label ?? s.title ?? s.caption ?? s.context));
      set(o, "prefix", str(s.prefix));
      set(o, "suffix", str(s.suffix ?? s.unit));
      const dec = num(s.decimals);
      set(o, "decimals", dec === undefined ? (value !== undefined && !Number.isInteger(value) ? Math.min(2, (String(value).split(".")[1] ?? "").length) : undefined) : clamp(Math.round(dec), 0, 2));
      set(o, "context", str(s.context ?? s.sub));
      set(o, "gold", bool(s.gold ?? s.highlight));
      set(o, "source", str(s.source));
      if (o.label) o.label = String(o.label).toUpperCase();
      break;
    }
    case "quote": {
      set(o, "text", str(s.text ?? s.quote));
      set(o, "who", str(s.who ?? s.author ?? s.speaker ?? s.by ?? s.name) ?? str(s.source));
      set(o, "source", str(s.source ?? s.outlet));
      set(o, "img", str(s.img ?? s.image));
      break;
    }
    case "compare": {
      const side = (v: unknown, fallbackName: string): Raw => {
        if (typeof v === "string") return { name: v };
        const o2: Raw = { name: (isObj(v) && str(v.name ?? v.title ?? v.label)) || fallbackName };
        if (isObj(v)) set(o2, "sub", str(v.sub ?? v.subtitle ?? v.club));
        return o2;
      };
      o.left = side(s.left ?? s.leftName ?? s.a, "LEFT");
      o.right = side(s.right ?? s.rightName ?? s.b, "RIGHT");
      const rows = (Array.isArray(s.rows) ? s.rows : Array.isArray(s.metrics) ? s.metrics : Array.isArray(s.stats) ? s.stats : [])
        .filter(isObj)
        .map((r) => {
          const left = num(r.left ?? r.a ?? r.l), right = num(r.right ?? r.b ?? r.r);
          const label = str(r.label ?? r.metric ?? r.name ?? r.stat);
          if (left === undefined || right === undefined || !label) return null;
          const o2: Raw = { label, left, right };
          set(o2, "leftLabel", str(r.leftLabel));
          set(o2, "rightLabel", str(r.rightLabel));
          set(o2, "lowerIsBetter", bool(r.lowerIsBetter ?? r.lower_is_better));
          return o2;
        })
        .filter((x): x is Raw => !!x)
        .slice(0, 6);
      if (rows.length) o.rows = rows;
      set(o, "title", str(s.title));
      set(o, "source", str(s.source));
      break;
    }
    case "board": {
      const ps = players(s.players ?? s.lineup ?? s.positions);
      if (ps.length) o.players = ps;
      const ids = new Set(ps.map((p) => p.id as string));
      o.steps = steps(s.steps ?? s.phases ?? s.frames, ids);
      set(o, "title", str(s.title ?? s.label));
      set(o, "ball", point(s.ball));
      set(o, "homeColor", str(s.homeColor));
      set(o, "awayColor", str(s.awayColor));
      const c = s.card ?? s.playerCard;
      if (typeof c === "string") o.card = { name: c };
      else if (isObj(c) && str(c.name ?? c.title)) {
        const card: Raw = { name: str(c.name ?? c.title) };
        set(card, "sub", str(c.sub ?? c.subtitle ?? c.role));
        set(card, "img", str(c.img ?? c.image));
        set(card, "prompt", str(c.prompt));
        set(card, "side", oneOf(c.side, ["left", "right"] as const));
        o.card = card;
      }
      break;
    }
    case "image": {
      o.src = str(s.src ?? s.file ?? s.image) ?? "";
      set(o, "prompt", str(s.prompt ?? s.description ?? s.picture));
      set(o, "person", str(s.person ?? s.subject_person));
      set(o, "style", oneOf(s.style, STYLE, STYLE_MAP));
      set(o, "caption", str(s.caption ?? s.label ?? s.title));
      set(o, "source", str(s.source));
      set(o, "kenburns", oneOf(s.kenburns ?? s.motion, ["in", "out", "left", "right", "none"] as const, { "zoom in": "in", zoom: "in", "zoom out": "out", pan: "left", still: "none" }));
      set(o, "fit", oneOf(s.fit, ["cover", "contain"] as const));
      if (o.caption) o.caption = String(o.caption).toUpperCase();
      break;
    }
    case "footage": {
      set(o, "src", str(s.src ?? s.file ?? s.clip));
      const from = num(s.from ?? s.start), to = num(s.to ?? s.end);
      set(o, "from", from === undefined ? undefined : Math.max(0, from));
      set(o, "to", to === undefined ? undefined : Math.max(0, to));
      set(o, "label", str(s.label));
      set(o, "caption", str(s.caption ?? s.title));
      set(o, "muted", bool(s.muted));
      const vol = num(s.volume);
      set(o, "volume", vol === undefined ? undefined : clamp(vol, 0, 1));
      const rate = num(s.playbackRate ?? s.speed);
      set(o, "playbackRate", rate !== undefined && rate > 0 ? rate : undefined);
      break;
    }
    case "cta": {
      set(o, "line", str(s.line ?? s.text ?? s.title ?? s.headline));
      set(o, "sub", str(s.sub ?? s.subtitle));
      break;
    }
  }
  void index;
  return o;
};

/** When a scene cannot be used as written, show the same beat as a picture so the voice-over keeps flowing. */
const asPicture = (o: Raw, s: Raw): Raw | null => {
  const vo = str(o.vo);
  const textBits = [s.title, s.label, s.context, s.caption, s.text, s.word, s.sub, s.line].map(str).filter((x): x is string => !!x);
  const prompt = str(s.prompt ?? s.bgPrompt) ?? (textBits.length || vo ? `${textBits.slice(0, 2).join(" — ")}${vo ? ` — ${vo}` : ""}`.slice(0, 300) : undefined);
  if (!vo && !prompt) return null;
  const pic: Raw = { type: "image", src: "" };
  if (vo) pic.vo = vo;
  for (const k of ["id", "duration", "hold", "sfx", "captions", "visuals"]) if (o[k] !== undefined) pic[k] = o[k];
  if (prompt) pic.prompt = prompt;
  const caption = textBits[0] ?? (vo ? vo.split(/\s+/).slice(0, 5).join(" ") : "");
  if (caption) pic.caption = caption.toUpperCase().replace(/[.!,;:]+$/, "").slice(0, 40);
  set(pic, "person", str(s.person ?? s.bgPerson));
  return pic;
};

const hookWord = (title: string): string => {
  const words = title.replace(/[^\w\s?'-]/g, " ").split(/\s+/).filter(Boolean);
  const strong = words.filter((w) => w.length >= 5 && !/^(about|their|there|these|those|which|where|after|before|again|manchester|united)$/i.test(w));
  return (strong[strong.length - 1] ?? words[words.length - 1] ?? "WHY?").toUpperCase().replace(/[^A-Z0-9?'-]/g, "") || "WHY?";
};

export type Defaults = { id: string; title: string; series?: string };

/** Whole script → validated Script + notes on what had to change (for the job log). Throws when nothing is salvageable. */
export const normalizeScript = (input: unknown, d: Defaults): NormalizeResult => {
  const notes: string[] = [];
  const rawIn = (isObj(input) ? stripNulls(input) : {}) as Raw;
  // the model sometimes nests the script, or calls the list something else
  const rawScript = (isObj(rawIn.script) ? rawIn.script : rawIn) as Raw;
  const sceneList = [rawScript.scenes, rawScript.timeline, rawScript.shots, rawScript.beats].find(Array.isArray) as unknown[] | undefined;
  if (!sceneList || sceneList.length === 0) throw new Error("the script has no scenes");

  const scenes: Raw[] = [];
  sceneList.forEach((item, i) => {
    const o = normalizeScene(item, i);
    const label = `scene ${i + 1}`;
    if (!o) {
      notes.push(`${label}: not a scene — dropped`);
      return;
    }
    const ok = Scene.safeParse(o);
    if (ok.success) return void scenes.push(ok.data as unknown as Raw);
    const why = ok.error.issues.slice(0, 3).map((x) => `${x.path.join(".") || "scene"}: ${x.message}`).join("; ");
    const pic = asPicture(o, (isObj(item) ? item : {}) as Raw);
    const pok = pic ? Scene.safeParse(pic) : null;
    if (pok?.success) {
      scenes.push(pok.data as unknown as Raw);
      notes.push(`${label} (${o.type}) could not be used as written (${why}) → shown as a picture`);
    } else notes.push(`${label} (${o.type}) dropped (${why})`);
  });
  if (scenes.length === 0) throw new Error("no usable scenes");

  // hook first, cta last — move them if they exist elsewhere, create them if not
  const hookAt = scenes.findIndex((s) => s.type === "hook");
  if (hookAt > 0) scenes.unshift(...scenes.splice(hookAt, 1));
  if (hookAt < 0) {
    scenes.unshift({ type: "hook", word: hookWord(d.title), sub: d.title });
    notes.push("no hook scene — added one from the title");
  }
  let ctaAt = -1;
  for (let i = scenes.length - 1; i >= 0; i--) if (scenes[i].type === "cta") { ctaAt = i; break; } // the last cta is the real one
  if (ctaAt >= 0 && ctaAt !== scenes.length - 1) scenes.push(...scenes.splice(ctaAt, 1));
  if (ctaAt < 0) {
    scenes.push({ type: "cta", line: "FOLLOW UTD DIARIES", vo: "Follow UTD Diaries for the next one." });
    notes.push("no cta scene — added the standard one");
  }
  // extra hooks / ctas in the middle break the format: show them as pictures
  for (let i = 1; i < scenes.length - 1; i++) {
    if (scenes[i].type === "hook" || scenes[i].type === "cta") {
      const pic = asPicture(scenes[i], scenes[i]);
      if (pic && Scene.safeParse(pic).success) {
        notes.push(`scene ${i + 1}: a second ${scenes[i].type} in the middle → shown as a picture`);
        scenes[i] = pic;
      } else {
        notes.push(`scene ${i + 1}: a second ${scenes[i].type} in the middle — dropped`);
        scenes.splice(i--, 1);
      }
    }
  }

  const voice = isObj(rawScript.voice) ? rawScript.voice : {};
  const music = isObj(rawScript.music) ? rawScript.music : {};
  const caps = isObj(rawScript.captions) ? rawScript.captions : {};
  const unit = (v: unknown) => { const n = num(v); return n === undefined ? undefined : clamp(n, 0, 1); };
  const out: Raw = {
    id: d.id,
    title: str(rawScript.title) ?? d.title,
    brand: "utd",
    scenes,
  };
  set(out, "series", str(rawScript.series ?? d.series));
  const v: Raw = {
    provider: oneOf(voice.provider, ["elevenlabs", "edge", "estimate"] as const) ?? "elevenlabs",
    voiceId: str(voice.voiceId) ?? "onwK4e9ZLuTAKqWW03F9",
    modelId: str(voice.modelId) ?? "eleven_multilingual_v2",
    stability: unit(voice.stability) ?? 0.45,
    similarity: unit(voice.similarity) ?? 0.8,
  };
  set(v, "style", unit(voice.style));
  const speed = num(voice.speed);
  set(v, "speed", speed === undefined ? undefined : clamp(speed, 0.7, 1.2));
  out.voice = v;
  out.music = { src: str(music.src) ?? "placeholder", volume: unit(music.volume) ?? 0.14, duck: unit(music.duck) ?? 0.35 };
  const c: Raw = { mode: oneOf(caps.mode, ["chunk", "word", "off"] as const, { chunks: "chunk", words: "word", none: "off", false: "off" }) ?? "chunk" };
  set(c, "y", num(caps.y));
  out.captions = c;
  set(out, "debug", bool(rawScript.debug));

  const parsed = Script.safeParse(out);
  if (!parsed.success) throw new Error(`script still invalid: ${parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ")}`);
  return { script: parsed.data, notes };
};

/** Validation issues of a raw script, in the "path: message" form the drafter reports. */
export const scriptIssues = (raw: unknown): string[] => {
  const r = Script.safeParse(raw);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

export type { SceneT as NormalizedScene };
