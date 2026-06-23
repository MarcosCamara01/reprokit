FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    openssh-client \
  && rm -rf /var/lib/apt/lists/*

# NOTE: in-loop UI-bug evidence needs the `agent-browser` CLI + a Chromium/Chrome
# binary, intentionally NOT installed here (environment provisioning is an ops task;
# see docs/cloud-deployment-notes.md and specs/agent-browser-repro). Without them,
# `needsBrowser` runs degrade cleanly with no screenshots.
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN mkdir -p .runs \
  && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "webhook"]
