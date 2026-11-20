// pnpm vo <slug> [--provider elevenlabs|edge|estimate] [--voice <id>] [--force] [--only 2,5]
//
// Generates one voice file per scene with word timestamps and writes
// videos/<slug>/vo/manifest.json. Scenes whose text (and voice) have not
// changed are skipped unless --force. Providers:
//   elevenlabs  production voice. Needs ELEVENLABS_API_KEY (+ voiceId in script or --voice / ELEVENLABS_VOICE_ID)
//   edge        free Microsoft neural voice via the Edge Read Aloud API; fine for drafts and previews
//   estimate    no audio, timing estimated from the text (render still works, silent)
import fs from "node:fs";
import path from "node:path";
import { parseBuffer } from "music-metadata";
import { estimateSpeechSeconds, estimateWordTimes, splitWords } from "../src/timing";
import type { VoManifest, VoSceneEntry } from "../src/schema";
import { hashText, loadScript, loadVo, log, parseArgs, saveVo, videoDir } from "./lib";

/** Voice pace for short-form (1.0 = the voice's natural speed). Script voice.speed wins, then UTD_VOICE_SPEED, then 1.15. */
const paceOf = (speed?: number) => Math.min(1.2, Math.max(0.7, speed ?? (Number(process.env.UTD_VOICE_SPEED) || 1.15)));
const edgeRate = (pace: number) => `${pace >= 1 ? "+" : ""}${Math.round((pace - 1) * 100)}%`;

type Word = { w: string; s: number; e: number };
type Synth = { audio: Buffer; words: Word[]; duration?: number };

// ---- ElevenLabs ------------------------------------------------------------
const elevenlabs = async (text: string, opts: { voiceId: string; modelId: string; stability?: number; similarity?: number; style?: number; speed?: number }): Promise<Synth> => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is missing — add it to the .env file at the repo root (or use --provider edge)");
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}/with-timestamps?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: opts.modelId,
      voice_settings: {
        stability: opts.stability ?? 0.45,
        similarity_boost: opts.similarity ?? 0.8,
        style: opts.style ?? 0.2,
        use_speaker_boost: true,
        speed: paceOf(opts.speed),
      },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if (res.status === 402 && body.includes("library voices")) {
      throw new Error(`ElevenLabs: this voice is a Library voice, which the Free plan cannot use via the API.\n  Either pick a premade voice (run: pnpm vo --voices) or upgrade to Starter.`);
    }
    if (/api_key_id_used_as_api_key/.test(body)) {
      throw new Error("ElevenLabs: the value in ELEVENLABS_API_KEY is a key ID, not the key. ElevenLabs shows the real key (it starts with sk_) only once, when you create it: Developers → API Keys → Create API Key, copy the sk_ value into .env, save, then run Voice again.");
    }
    if (/quota_exceeded|credits? remaining|exceeds your quota/i.test(body)) {
      const left = body.match(/You have (\d+) credits? remaining/i)?.[1];
      throw new Error(`ElevenLabs: this month's character quota is used up${left ? ` (${left} left, this run needs more)` : ""}. Options: wait for the monthly reset, upgrade the plan, or pick "edge" as the voice provider in Settings → Voice (free Microsoft voice) and run Voice again.`);
    }
    if (res.status === 401 || /invalid_api_key|authentication_error/.test(body)) {
      throw new Error(`ElevenLabs rejected the key in ELEVENLABS_API_KEY (invalid or revoked). Create a new key (Developers → API Keys), paste the sk_ value into .env, save, then run Voice again. [ElevenLabs said: ${body.slice(0, 160)}]`);
    }
    throw new Error(`ElevenLabs ${res.status}: ${body}`);
  }
  const json = (await res.json()) as {
    audio_base64: string;
    alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null;
  };
  const audio = Buffer.from(json.audio_base64, "base64");
  const words: Word[] = [];
  const al = json.alignment;
  if (al) {
    let cur = "", s = 0, e = 0;
    const flush = () => {
      if (cur) words.push({ w: cur, s, e });
      cur = "";
    };
    al.characters.forEach((ch, i) => {
      if (/\s/.test(ch)) return flush();
      if (!cur) s = al.character_start_times_seconds[i];
      e = al.character_end_times_seconds[i];
      cur += ch;
    });
    flush();
  }
  return { audio, words };
};

// ---- Microsoft Edge (free, drafts) ------------------------------------------
// Node client first; if the WebSocket cannot get through (proxies, sandboxes)
// fall back to the Python `edge-tts` package via edge_tts_helper.py.
const mergeTokens = (text: string, words: Word[]): Word[] => {
  // the API tokenises punctuation separately; merge tokens back onto the script's own words
  const norm = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  const scriptWords = splitWords(text);
  const merged: Word[] = [];
  let wi = 0;
  for (const sw of scriptWords) {
    const target = norm(sw);
    let s = -1, e = -1, acc = "";
    while (wi < words.length) {
      const tok = norm(words[wi].w);
      if (!tok) {
        wi++;
        continue;
      }
      if (acc && !target.startsWith(acc + tok)) break;
      if (!acc && !target.startsWith(tok)) {
        wi++;
        continue;
      }
      if (s < 0) s = words[wi].s;
      e = words[wi].e;
      acc += tok;
      wi++;
      if (acc === target) break;
    }
    if (s >= 0) merged.push({ w: sw, s, e });
  }
  return merged.length >= Math.ceil(scriptWords.length * 0.7) ? merged : words;
};

const edgePython = async (text: string, voice: string, rate = "+0%"): Promise<Synth> => {
  const { spawnSync } = await import("node:child_process");
  const os = await import("node:os");
  const { fileURLToPath } = await import("node:url");
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), "edge_tts_helper.py");
  const tmp = path.join(os.tmpdir(), `utd-edge-${Date.now()}.mp3`);
  const candidates = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
  let lastErr = "";
  for (const py of candidates) {
    const r = spawnSync(py, [helper, voice, tmp, rate], { input: text, encoding: "utf8", timeout: 90000 });
    if (r.error) {
      lastErr = String(r.error.message);
      continue;
    }
    if (r.status === 0 && fs.existsSync(tmp)) {
      const audio = fs.readFileSync(tmp);
      fs.rmSync(tmp, { force: true });
      const { words } = JSON.parse(r.stdout.trim().split("\n").pop() ?? "{}") as { words?: Word[] };
      return { audio, words: mergeTokens(text, words ?? []) };
    }
    lastErr = (r.stderr || r.stdout || `exit ${r.status}`).slice(-400);
  }
  throw new Error(`edge voice failed in Node and Python. Install the fallback with: pip install edge-tts\n${lastErr}`);
};

const edge = async (text: string, voice: string, rate = "+0%"): Promise<Synth> => {
  try {
    return await edgeNode(text, voice, rate);
  } catch (e) {
    log(`edge (node) failed: ${(e as Error).message.split("\n")[0]} → trying python edge-tts`);
    return edgePython(text, voice, rate);
  }
};

const edgeNode = async (text: string, voice: string, rate = "+0%"): Promise<Synth> => {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  let agent: import("node:http").Agent | undefined;
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (proxy) {
    const { HttpsProxyAgent } = await import("https-proxy-agent");
    agent = new HttpsProxyAgent(proxy) as unknown as import("node:http").Agent;
  }
  const tts = new MsEdgeTTS({ agent, connectionTimeoutMs: 20000, synthesisTimeoutMs: 60000 });
  const locale = voice.match(/^([a-z]{2,3}-[A-Z]{2,})/)?.[1] ?? "en-GB";
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true, sentenceBoundaryEnabled: false, voiceLocale: locale });
  const { audioStream, metadataStream } = tts.toStream(text, { rate });
  const chunks: Buffer[] = [];
  const words: Word[] = [];
  const metaDone = new Promise<void>((resolve) => {
    if (!metadataStream) return resolve();
    metadataStream.on("data", (d: Buffer | string | object) => {
      try {
        const obj = typeof d === "object" && !Buffer.isBuffer(d) ? (d as { Metadata?: unknown[] }) : JSON.parse(d.toString());
        for (const m of (obj.Metadata ?? []) as { Type: string; Data: { Offset: number; Duration: number; text: { Text: string } } }[]) {
          if (m.Type === "WordBoundary") {
            const s = m.Data.Offset / 1e7, e = s + m.Data.Duration / 1e7;
            words.push({ w: m.Data.text.Text, s, e });
          }
        }
      } catch {
        /* ignore non-JSON metadata frames */
      }
    });
    metadataStream.on("close", () => resolve());
    metadataStream.on("end", () => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    audioStream.on("data", (d: Buffer) => chunks.push(d));
    audioStream.on("error", reject);
    audioStream.on("close", () => resolve());
    audioStream.on("end", () => resolve());
  });
  await Promise.race([metaDone, new Promise((r) => setTimeout(r, 1500))]);
  tts.close();
  const audio = Buffer.concat(chunks);
  if (audio.length < 2000) throw new Error("edge returned no audio");
  return { audio, words: mergeTokens(text, words) };
};

// ---- list voices -------------------------------------------------------------
const listVoices = async () => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is missing — add it to the .env file at the repo root (or use --provider edge)");
  const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { voices } = (await res.json()) as { voices: { voice_id: string; name: string; category: string; labels?: Record<string, string> }[] };
  const rows = voices
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map((v) => `${v.voice_id}  ${v.name.padEnd(14)} ${v.category.padEnd(12)} ${Object.values(v.labels ?? {}).join(" · ")}`);
  console.log(`voice_id              name           category     labels\n${rows.join("\n")}`);
  console.log("\nFree plan: only `premade` voices work through the API. Library/cloned voices need Starter or above.");
};

// ---- main -------------------------------------------------------------------
const main = async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.voices) return listVoices();
  const slug = positional[0];
  if (!slug) throw new Error("usage: pnpm vo <slug> [--provider elevenlabs|edge|estimate] [--voice id] [--force]   |   pnpm vo --voices");
  const dir = videoDir(slug);
  const script = loadScript(dir);
  const previous = loadVo(dir);

  const pick = (...vals: unknown[]): string => String(vals.find((v) => typeof v === "string" && v.trim()) ?? "");
  const provider = pick(flags.provider, script.voice?.provider, process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "edge") as "elevenlabs" | "edge" | "estimate";
  const voiceId =
    provider === "edge"
      ? pick(flags.voice, process.env.EDGE_VOICE, /^[a-z]{2,3}-[A-Z]{2,}-/.test(String(script.voice?.voiceId ?? "")) ? script.voice?.voiceId : "", "en-GB-RyanNeural")
      : pick(flags.voice, script.voice?.voiceId, process.env.ELEVENLABS_VOICE_ID);
  const modelId = script.voice?.modelId ?? "eleven_multilingual_v2";
  if (provider === "elevenlabs" && !voiceId) throw new Error("No voice id. Set voice.voiceId in script.json, pass --voice, or set ELEVENLABS_VOICE_ID.");
  const only = flags.only ? String(flags.only).split(",").map((n) => Number(n) - 1) : null;

  fs.mkdirSync(path.join(dir, "vo"), { recursive: true });
  const manifest: VoManifest = {
    provider,
    voiceId: voiceId || undefined,
    generatedAt: new Date().toISOString(),
    scenes: { ...(previous?.provider === provider && previous?.voiceId === (voiceId || undefined) ? previous.scenes : {}) },
  };

  let made = 0, kept = 0;
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const text = scene.vo?.trim();
    const key = String(i);
    if (!text) {
      delete manifest.scenes[key];
      continue;
    }
    const pace = paceOf(script.voice?.speed);
    const hash = hashText(`${provider}|${voiceId}|${modelId}|${pace}|${text}`);
    const prev = manifest.scenes[key];
    const file = `vo/scene-${String(i + 1).padStart(2, "0")}.mp3`;
    const exists = prev?.file ? fs.existsSync(path.join(dir, prev.file)) : provider === "estimate";
    if (!flags.force && prev && prev.hash === hash && exists && (!only || !only.includes(i))) {
      kept++;
      continue;
    }
    if (only && !only.includes(i)) continue;

    let entry: VoSceneEntry;
    if (provider === "estimate") {
      const d = estimateSpeechSeconds(text);
      entry = { duration: d, words: estimateWordTimes(text, d), text, hash, estimated: true };
    } else {
      log(`scene ${i + 1}/${script.scenes.length} → ${provider} (${text.length} chars)`);
      const synth = provider === "elevenlabs" ? await elevenlabs(text, { ...script.voice, voiceId, modelId }) : await edge(text, voiceId, edgeRate(pace));
      fs.writeFileSync(path.join(dir, file), synth.audio);
      const meta = await parseBuffer(synth.audio, { mimeType: "audio/mpeg" });
      const lastWord = synth.words.length ? synth.words[synth.words.length - 1].e : 0;
      const duration = meta.format.duration ?? lastWord + 0.2;
      const words = synth.words.length ? synth.words : estimateWordTimes(text, duration);
      entry = { file, duration, words, text, hash };
    }
    manifest.scenes[key] = entry;
    made++;
    saveVo(dir, manifest); // save after every scene so a crash keeps progress
  }
  saveVo(dir, manifest);
  const total = Object.values(manifest.scenes).reduce((a, s) => a + s.duration, 0);
  log(`voice: ${made} generated, ${kept} unchanged · ${provider}${voiceId ? ` (${voiceId})` : ""} · speech ${total.toFixed(1)}s → ${path.join(dir, "vo", "manifest.json")}`);
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
