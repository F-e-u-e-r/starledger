#!/usr/bin/env bash
# P2 notifier gate:
#
#   typecheck · lint · format check · tests · build
#   · real-git state-branch smoke · replay smoke
#   · opt-in Telegram test-chat smoke
#
# The smoke imports the built notifier artifact, so build must run before it.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

step "typecheck"; pnpm -s typecheck
step "lint"; pnpm -s lint
step "format check"; pnpm -s format:check
step "test"; pnpm -s test
step "build"; pnpm -s build
step "notifier real-git state smoke"; node scripts/smoke-notifier-state.mjs
step "notifier replay smoke"; node scripts/smoke-notifier-replay.mjs
step "Telegram test-chat smoke (opt-in)"; node scripts/smoke-telegram-test-chat.mjs

printf '\n\033[1;32mP2 notifier gate passed.\033[0m\n'
