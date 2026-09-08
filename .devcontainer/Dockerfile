FROM node:22-slim

ENV TZ=UTC

RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends \
    ca-certificates curl git tzdata sqlite3 gnupg \
 && rm -rf /var/lib/apt/lists/*

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

USER node
WORKDIR /workspace
