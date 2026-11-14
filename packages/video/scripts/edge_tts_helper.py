#!/usr/bin/env python3
"""Fallback for the `edge` voice provider when the Node client cannot connect
(corporate proxies, sandboxes). Called by vo.ts:

    python edge_tts_helper.py <voice> <out.mp3> < text-on-stdin  → prints JSON {words:[{w,s,e}]}

Needs:  pip install edge-tts
"""
import asyncio
import json
import os
import sys


async def main() -> None:
    import edge_tts  # type: ignore

    voice, out = sys.argv[1], sys.argv[2]
    text = sys.stdin.read().strip()
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    comm = edge_tts.Communicate(text, voice, proxy=proxy, boundary="WordBoundary")
    words = []
    with open(out, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                s = chunk["offset"] / 1e7
                words.append({"w": chunk["text"], "s": s, "e": s + chunk["duration"] / 1e7})
    print(json.dumps({"words": words}))


if __name__ == "__main__":
    asyncio.run(main())
