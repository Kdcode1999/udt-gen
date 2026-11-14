#!/bin/sh
set -e
# first boot on an empty disk: seed the demo so the home page is not blank
mkdir -p "${UTD_VIDEOS_DIR:-/data/videos}"
if [ -z "$(ls -A "${UTD_VIDEOS_DIR:-/data/videos}")" ] && [ -d /app/videos ]; then
  cp -r /app/videos/. "${UTD_VIDEOS_DIR:-/data/videos}/"
fi
cd /app/apps/web
exec pnpm exec next start -p "${PORT:-3000}" -H 0.0.0.0
