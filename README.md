# utd-gen

Video generator for **UTD Diaries**. A `script.json` goes in; a voiced, captioned 1080×1920 MP4 comes out.
Built on [Remotion](https://www.remotion.dev) (React video): the same scene code previews live in the browser and renders on your PC or on Modal.

```
packages/video   Remotion compositions + CLI (vo / render / still / studio)
worker/          Modal render worker (cloud renders, phase 2 web app calls this)
videos/<slug>/   one folder per video: script.json, assets/, vo/, out/
apps/web         local web UI: scene editor, assets, live preview, Voice / Stills / Render buttons
```

## Setup (Windows, PowerShell 5)

```powershell
# once
corepack enable; corepack prepare pnpm@10 --activate
git clone <this repo> utd-gen; cd utd-gen; pnpm install
pip install edge-tts            # free draft voice (optional, ElevenLabs is the real one)

# keys — once, in a file (git-ignored, never commit it)
copy .env.example .env; notepad .env     # paste the keys after the = signs, save
```

`.env` holds `ELEVENLABS_API_KEY` (voice), `ANTHROPIC_API_KEY` (Draft with AI, topic radar, post copy), `OPENAI_API_KEY` (pictures) and `YOUTUBE_API_KEY` (fan comments for the radar — Google Cloud → YouTube Data API v3). The app and every CLI script read it on start, from any window. Drafting, the topic radar, post copy and the picture planner run on Claude when `ANTHROPIC_API_KEY` is set and has credit, otherwise on OpenAI (`OPENAI_API_KEY`, model `gpt-6.2-sol`, its own web search) — if Claude says it's out of credit mid-session, everything switches to OpenAI automatically. Force one with `UTD_AI=openai`. A `$env:NAME = "..."` set in the window still wins over the file. Edit the file and save — the app picks the change up on the next page load or button press, no restart.

First render downloads Chrome Headless Shell (~100 MB) automatically. To use an existing Chrome instead, add `UTD_BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe` to `.env`.

## The UI (easiest)

```powershell
pnpm dev                              # → http://localhost:3000
```

The terminal's first line says which keys came from `.env` and which are still missing. The header shows a chip per key (voice · images · youtube · ai draft). A draft writes an image `prompt` per image scene and per player card; **Images** paints them into `assets/` (runs automatically after a draft when the key is set). An image scene with no file renders as a caption plate, never a blank frame.

Videos list → open one (or **New video**) → edit scenes in forms, upload images/clips, watch the live preview on the right → **Voice** → **Stills** → **Render** → **Download MP4**. Everything it writes goes to `videos/<slug>/`, the same files the CLI uses, so the two are interchangeable.
The tactical board has a click-to-place pitch: select a player row, click the pitch; select a step, add moves/arrows/zones the same way.

### Topics (topic radar)

**Topics** in the header scans what United fans are arguing about right now — comments under the big United YouTube channels, r/reddevils and r/soccer, the headlines behind them, plus a web check of X/TikTok — and ranks eight video-worthy topics with a hook word, why-now, angle and a brief. **Draft this →** sends one straight into research & draft.
Every scan is saved under `videos/.radar/scans/` (the last 60), so the page keeps a history: pick any past scan from the row under the button, ★ keeps a topic on the **Kept** list for later, and a topic you drafted shows **Drafted · open →** linking to its video.

## Make a video (CLI)

```powershell
mkdir videos\my-video; copy videos\demo\script.json videos\my-video\script.json   # edit it
pnpm still my-video                 # one PNG per scene → videos/my-video/out/stills  (approval gate)
pnpm vo my-video                    # voice per scene + word timestamps → vo/manifest.json
pnpm images my-video                # paints image scenes / card sketches from their prompts (OPENAI_API_KEY)
pnpm render my-video                # → out/my-video.mp4 + captions.srt + vo-sheet.md + thumb.png
pnpm studio my-video                # live preview in the browser, scrub any frame
```

Flags: `pnpm vo <slug> --provider edge` (free Microsoft voice for drafts), `--force` (re-voice everything), `--only 3,5` (re-voice two scenes).
`pnpm render <slug> --scenes` also writes silent per-scene MP4s to `out/scenes/`.

Only scenes whose VO text changed get re-voiced, so fixing one line costs one API call.

### Put it online (Railway, one container)

The app, voice, images and renders all run in one container from the `Dockerfile`; `videos/` lives on a persistent volume.

1. railway.com → **New Project → Deploy from GitHub repo** → `udt-gen`. Railway reads `railway.json` and builds the Dockerfile (first build ≈ 8 min: it downloads Chrome).
2. Service → **Settings → Volumes → Add volume**, mount path `/data`.
3. Service → **Variables**: `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `UTD_PASSCODE` (any long phrase), optional `UTD_CONCURRENCY=2`.
4. **Settings → Networking → Generate domain**. Open `https://<domain>/?key=<passcode>` once; the browser remembers it.

Every push to `main` redeploys. A 60–90 s video renders in roughly 5–8 min on the default 2 vCPU; bump the plan or offload to Modal when that hurts.

### Cloud render (Modal)

```powershell
pip install modal; modal setup
modal secret create utd-gen ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=...
modal run worker/modal_app.py --slug my-video      # uploads the folder, voices + renders, downloads out/
```

## script.json

```jsonc
{
  "id": "slug", "title": "…", "brand": "utd", "series": "MATCH DIARY",
  "voice":    { "provider": "elevenlabs", "voiceId": "…", "modelId": "eleven_multilingual_v2", "stability": 0.45, "similarity": 0.8 },
  "music":    { "src": "placeholder", "volume": 0.14, "duck": 0.35 },   // or "assets/bed.mp3"
  "captions": { "mode": "chunk" },                                       // chunk | word | off
  "scenes": [ … ]
}
```

Every scene accepts `vo` (the spoken line), `duration` (seconds, minimum), `hold` (extra seconds after the voice), `sfx` (`whoosh | hit | tick | riser | none`) and `captions: false`.
Scene length = voice length + 0.45 s, never shorter than the type's floor.

| type | fields | notes |
|---|---|---|
| `hook` | `word`, `sub?`, `kicker?` | one-word hook, auto-sized |
| `stat` | `value`, `label`, `gold?`, `prefix?`, `suffix?`, `decimals?`, `context?`, `source?` | count-up; gold cards for the headline stats only |
| `quote` | `text`, `who`, `source?`, `img?` | |
| `compare` | `left{name,sub?}`, `right{…}`, `rows[{label,left,right,lowerIsBetter?,leftLabel?,rightLabel?}]`, `title?`, `source?` | bars grow outward, winner in gold |
| `board` | `players[{id,team,x,y,name?,number?}]`, `steps[…]`, `title?`, `ball?`, `card?`, `homeColor?`, `awayColor?` | see below |
| `image` | `src` ("" until generated), `prompt?`, `style?` (`plate\|sketch\|photo`), `caption?`, `source?`, `kenburns?`, `fit?` | `pnpm images` fills `src` from `prompt` |
| `footage` | `src`, `from?`, `to?` (seconds), `label?`, `caption?`, `muted?` (default true), `playbackRate?` | |
| `cta` | `line?`, `sub?` | always last |

### Tactical board

Pitch coordinates: `x` 0–100 left→right, `y` 0–100 top goal→bottom goal. Each **step** is what is on the board at that moment:

```jsonc
{ "at": 4.2,                                   // seconds into the scene (optional, auto-spaced otherwise)
  "label": "LINE NOT *SET*",                   // big word, *gold* span
  "players": { "h_rb": { "x": 84, "y": 58 } }, // moves, persist into later steps
  "ball": { "x": 80, "y": 76 },
  "lines":   [ { "from": "h_lb", "to": "h_lcb", "color": "red" } ],
  "arrows":  [ { "from": "a_am", "to": { "x": 82, "y": 76 }, "style": "pass", "curve": 0.2 } ],   // pass | run | key | press
  "highlight": ["a_rw"],
  "zone": { "x": 80, "y": 76, "rx": 10, "ry": 7, "label": "space" },
  "zoom": { "x": 70, "y": 66, "scale": 1.3 } }
```

Arrows are smooth curves in pixel space; lines and arrows draw in one after another; players glide between steps; the camera eases between zooms. `card` adds the sketch-portrait card (`img` optional, monogram otherwise).

## Assets

- `videos/<slug>/assets/` — images, clips, music for that video. Reference them as `assets/x.png`.
- `packages/video/assets/sfx/` — shared SFX + music bed. **The bundled ones are synthesised placeholders**; drop a licensed pack in with the same names (`whoosh.mp3`, `hit.mp3`, `tick.mp3`, `riser.mp3`, `bed-placeholder.mp3`).
- Fonts (Anton, Inter) are embedded; nothing is fetched at render time.

## When a draft goes wrong

The drafter never asks Claude to "fix its JSON". The script arrives through a tool call (valid JSON by construction) and `@utd/video/normalize` makes it schema-true in code: nulls removed, `"72"` → `72`, enums lower-cased and synonyms mapped (`tactical` → `board`), a player's team inferred from its id, ranges clamped; a scene that still cannot be used is shown as a picture with the same voice line. The job log says what was tidied. Only a visually thin draft or a script with no usable scenes goes back to Claude, and a total failure leaves `draft-failed.json` in the video folder with the raw script and the reason.

## Content rules that keep the page safe

- Broadcast match footage gets matched by Rights Manager whatever you do to it. Use boards, stills, AI plates, your own shots, stock.
- Quotes carry the source on screen (`source` field). Stats carry `source`.
- Verify every fact live before writing a script; label transfers CONFIRMED / AGREED / RUMOUR / TARGET.

## Demo

`videos/demo` is a worked example built on the Man Utd 4–4 Aston Villa match (8 Nov 2026; facts from Sky Sports and ESPN match reports). Board positions are illustrative, the plate and clip are placeholders.

## Roadmap

1. **Engine** (this) — scenes, voice, captions, CLI, Modal worker.
2. **Hosted app** — the same UI deployed on Vercel with Neon Postgres + Cloudflare R2 for storage and renders queued to Modal (local version done; cloud storage swap next).
3. **Distribution** — Reels Publishing API, caption drafts, Pexels/OpenAI image search in the editor, batch queue.
4. **Analysis tie-in** — the freeze-frame CV engine as an `analysis` scene type.
