"""
UTD Gen render worker on Modal.

    modal secret create utd-gen ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=...
    modal run worker/modal_app.py --slug demo            # upload videos/demo, voice (if needed) + render, download out/
    modal run worker/modal_app.py --slug demo --no-vo    # render only
    modal deploy worker/modal_app.py                     # keep it warm as a deployed function (phase 2 web app calls it)

Flow: videos/<slug> is synced to the `utd-videos` Volume → the container runs
`pnpm vo` (ElevenLabs) then `pnpm render` with UTD_VIDEOS_DIR pointing at the
Volume → outputs land in /data/videos/<slug>/out and are copied back locally.

Not exercised from the sandbox this was written in (no Modal token there);
first run on your machine will tell. Image build takes ~5 min the first time.
"""
from __future__ import annotations

import os
import pathlib
import subprocess

import modal

REPO = pathlib.Path(__file__).resolve().parent.parent
APP_NAME = "utd-gen"
VOLUME_NAME = "utd-videos"
DATA = "/data"  # volume mount

app = modal.App(APP_NAME)
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

# Chrome Headless Shell runtime deps (Remotion's Debian list) + ffmpeg for the placeholder tooling.
CHROME_DEPS = [
    "libnss3", "libdbus-1-3", "libatk1.0-0", "libgbm-dev", "libasound2", "libxrandr2",
    "libxkbcommon-dev", "libxfixes3", "libxcomposite1", "libxdamage1", "libatk-bridge2.0-0",
    "libcups2", "libpango-1.0-0", "libcairo2", "fonts-liberation", "ca-certificates", "curl", "gnupg", "ffmpeg",
]

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(*CHROME_DEPS)
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        "npm install -g pnpm@10",
    )
    .pip_install("edge-tts")  # free draft voice fallback
    .add_local_dir(
        str(REPO),
        remote_path="/repo",
        copy=True,
        ignore=["**/node_modules", ".git", "videos/*/out", "videos/*/vo/*.mp3", "**/.remotion", "**/*.log"],
    )
    .run_commands(
        "cd /repo && pnpm install --frozen-lockfile",
        # download Chrome Headless Shell once at build time so renders start cold-fast
        "cd /repo/packages/video && npx remotion browser ensure",
    )
    .env({"UTD_VIDEOS_DIR": f"{DATA}/videos", "CI": "1"})
)


def _run(cmd: list[str], cwd: str) -> None:
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=cwd, check=True)


@app.function(
    image=image,
    cpu=4,
    memory=8192,
    timeout=60 * 45,
    volumes={DATA: volume},
    secrets=[modal.Secret.from_name("utd-gen")],
)
def render(slug: str, do_vo: bool = True, scenes: bool = False) -> list[str]:
    """Voice (optional) + render one video that already lives on the Volume. Returns output file names."""
    volume.reload()
    video_dir = pathlib.Path(DATA) / "videos" / slug
    if not (video_dir / "script.json").exists():
        raise FileNotFoundError(f"{video_dir}/script.json not on the volume — run with the local entrypoint to sync it")

    pkg = "/repo/packages/video"
    if do_vo and os.environ.get("ELEVENLABS_API_KEY"):
        _run(["pnpm", "vo", slug], cwd=pkg)
    elif do_vo:
        print("ELEVENLABS_API_KEY missing in secret `utd-gen` → using free edge voice for this run", flush=True)
        _run(["pnpm", "vo", slug, "--provider", "edge"], cwd=pkg)

    cmd = ["pnpm", "render", slug, "--concurrency", "4"]
    if scenes:
        cmd.append("--scenes")
    _run(cmd, cwd=pkg)
    volume.commit()
    out = video_dir / "out"
    return sorted(str(p.relative_to(video_dir)) for p in out.rglob("*") if p.is_file())


@app.local_entrypoint()
def main(slug: str = "demo", no_vo: bool = False, scenes: bool = False) -> None:
    local = REPO / "videos" / slug
    if not (local / "script.json").exists():
        raise SystemExit(f"no videos/{slug}/script.json")

    # 1) sync videos/<slug> (script, assets, existing vo) up to the volume
    print(f"uploading videos/{slug} → volume {VOLUME_NAME}", flush=True)
    with volume.batch_upload(force=True) as batch:
        for p in local.rglob("*"):
            if p.is_file() and "out" not in p.relative_to(local).parts:
                batch.put_file(str(p), f"videos/{slug}/{p.relative_to(local).as_posix()}")

    # 2) render remotely
    files = render.remote(slug, do_vo=not no_vo, scenes=scenes)

    # 3) pull vo + out back down
    for rel in files:
        dest = local / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in volume.read_file(f"videos/{slug}/{rel}"):
                f.write(chunk)
        print("↓", rel, flush=True)
    # also pull the voice files the remote run produced
    for entry in volume.listdir(f"videos/{slug}/vo"):
        name = entry.path.split("/")[-1]
        dest = local / "vo" / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            for chunk in volume.read_file(entry.path):
                f.write(chunk)
    print(f"done → videos/{slug}/out/{slug}.mp4", flush=True)
