#!/usr/bin/env bash
# Agent-branch gate. Run this only from a dedicated executor branch / PR, not
# from normal source-code work: it intentionally permits exactly two artifact files.
set -euo pipefail
cd "$(dirname "$0")/.."

base_ref="${1:-origin/main}"
pnpm -s classifier verify-agent-diff --base "$base_ref"

if [[ -f ai-annotations.json || -f ai-annotations-meta.json ]]; then
  if [[ ! -f ai-annotations.json || ! -f ai-annotations-meta.json ]]; then
    echo "AI artifacts must be added, updated, or removed together"
    exit 1
  fi
  pnpm -s classifier verify-artifacts \
    --annotations ai-annotations.json \
    --meta ai-annotations-meta.json
fi

printf '\n\033[1;32mP3 agent branch gate passed.\033[0m\n'
