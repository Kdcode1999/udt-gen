# UTD Gen — one container runs the web app, voice, images and renders (same code as `pnpm dev`).
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

# Chrome Headless Shell runtime deps (Remotion), ffmpeg, python for the free edge voice fallback
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl ffmpeg python3 python3-pip \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 libxfixes3 \
    libxcomposite1 libxdamage1 libatk-bridge2.0-0 libcups2 libpango-1.0-0 libcairo2 libx11-xcb1 libxshmfence1 fonts-liberation \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --break-system-packages --no-cache-dir edge-tts

WORKDIR /app

# install with the lockfile first (layer cache), then copy the source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/video/package.json packages/video/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .

# download Chrome Headless Shell once at build time; build the web app
RUN cd packages/video && npx remotion browser ensure \
 && cd ../../apps/web && pnpm build

ENV NODE_ENV=production
ENV UTD_VIDEOS_DIR=/data/videos
ENV PORT=3000
EXPOSE 3000
VOLUME ["/data"]

CMD ["sh", "./docker-entrypoint.sh"]
