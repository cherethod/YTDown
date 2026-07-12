FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-pip \
    && python3 -m pip install --break-system-packages --no-cache-dir --upgrade \
      "yt-dlp[default]" bgutil-ytdlp-pot-provider \
    && yt-dlp --version \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY server.js logic.js app.js index.html styles.css favicon.svg ./

ENV NODE_ENV=production
EXPOSE 4173

CMD ["node", "server.js"]
