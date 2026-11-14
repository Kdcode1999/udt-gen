# utd-gen

Video generator for **UTD Diaries**. A `script.json` goes in; a voiced, captioned 1080×1920 MP4 comes out.
Built on [Remotion](https://www.remotion.dev) (React video): the same scene code previews live in the browser and renders on your PC or on Modal.

```
packages/video   Remotion compositions + CLI (vo / render / still / studio)
worker/          Modal render worker (cloud renders, phase 2 web app calls this)
videos/<slug>/   one folder per video: script.json, assets/, vo/, out/
apps/web         phase 2 — Next.js app (not started)
```

## Setup (Windows, PowerShell 5)

```powershell
# once
corepack enable; corepack prepare pnpm@10 --activate
git clone <this repo> utd-gen; cd utd-gen; pnpm install
pip install edge-tts            # free draft voice (optional, ElevenLabs is the real one)

# keys — never commit these
$env:ELEVENLABS_API_KEY = "..."
$env:ELEVENLABS_VOICE_ID = "..."   # or put voiceId in script.json
```

First render downloads Chrome Headless Shell (~100 MB) automatically. To use an existing Chrome instead: `$env:UTD_BROWSER = "C:\Program Files\Google\Chrome\Application\chrome.exe"`.

## Make a video

```powershell
mkdir videos\my-video; copy videos\demo\script.json videos\my-video\script.json   # edit it
pnpm still my-video                 # one PNG per scene → videos/my-video/out/stills  (approval gate)
pnpm vo my-video                    # voice per scene + word timestamps → vo/manifest.json
pnpm render my-video                # → out/my-video.mp4 + captions.srt + vo-sheet.md + thumb.png
pnpm studio my-video                # live preview in the browser, scrub any frame
```

Flags: `pnpm vo <slug> --provider edge` (free Microsoft voice for drafts), `--force` (re-voice everything), `--only 3,5` (re-voice two scenes).
`pnpm render <slug> --scenes` also writes silent per-scene MP4s to `out/scenes/`.

Only scenes whose VO text changed get re-voiced, so fixing one line costs one API call.

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
| `image` | `src`, `caption?`, `source?`, `kenburns?` (`in\|out\|left\|right\|none`), `fit?` | |
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

## Content rules that keep the page safe

- Broadcast match footage gets matched by Rights Manager whatever you do to it. Use boards, stills, AI plates, your own shots, stock.
- Quotes carry the source on screen (`source` field). Stats carry `source`.
- Verify every fact live before writing a script; label transfers CONFIRMED / AGREED / RUMOUR / TARGET.

## Demo

`videos/demo` is a worked example built on the Man Utd 4–4 Aston Villa match (8 Nov 2026; facts from Sky Sports and ESPN match reports). Board positions are illustrative, the plate and clip are placeholders.

## Roadmap

1. **Engine** (this) — scenes, voice, captions, CLI, Modal worker.
2. **Hosted app** — Next.js on Vercel, Neon Postgres, Cloudflare R2, Remotion Player preview, render queue → Modal.
3. **Distribution** — Reels Publishing API, caption drafts, Pexels/OpenAI image search in the editor, batch queue.
4. **Analysis tie-in** — the freeze-frame CV engine as an `analysis` scene type.
