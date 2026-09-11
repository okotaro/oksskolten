FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy

# 2026/9現在、ubuntu.comaptの調子が悪いのでaptは回避する

# Node.js (LTS) をバイナリ直接配置
RUN curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1

# GitHub CLI (gh) をバイナリ直接配置
RUN curl -fsSL https://github.com/cli/cli/releases/download/v2.67.0/gh_2.67.0_linux_amd64.tar.gz | tar -xz -C /tmp \
    && mv /tmp/gh_2.67.0_linux_amd64/bin/gh /usr/local/bin/ \
    && rm -rf /tmp/gh_*

# Claude Code のインストール
RUN npm install -g @anthropic-ai/claude-code

# cc-sdd (Kiro式Spec-Driven Development ハーネス) のインストール
RUN npm install -g cc-sdd

# jq をバイナリ直接配置（Claude Codeのstatusline設定で使用）
RUN curl -fsSL -o /usr/local/bin/jq https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64 \
    && chmod +x /usr/local/bin/jq

# Claude Code のユーザー設定（statusline）を配置
COPY claude/settings.json /home/vscode/.claude/settings.json
COPY claude/scripts/awesome-statusline-small.sh /home/vscode/.claude/scripts/awesome-statusline-small.sh
RUN chown -R vscode:vscode /home/vscode/.claude \
    && chmod +x /home/vscode/.claude/scripts/awesome-statusline-small.sh

# シンボリックリンクの置き場所（VS Code側にローカルのフォルダ名を透過させるため）
RUN mkdir -p /workspaces && chown vscode:vscode /workspaces

# 作業ディレクトリの指定
WORKDIR /workspace
