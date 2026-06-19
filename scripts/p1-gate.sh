#!/usr/bin/env bash
# P1 release gate. The full quality + safety suite for the dashboard release:
#
#   typecheck · lint · format check · test · build · schemas (+ drift)
#   · P0 real-git publication smoke
#   · dashboard artifact integrity smoke + GitHub Pages base-path smoke
#
# The live Pages deployment should run only after this gate passes.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

step "typecheck";     pnpm -s typecheck
step "lint";          pnpm -s lint
step "format check";  pnpm -s format:check
step "test";          pnpm -s test
step "build";         pnpm -s build

step "schemas (regenerate + verify clean)"
pnpm -s schemas
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if ! git diff --quiet -- schemas; then
    echo "schemas/ is out of date — run 'pnpm schemas' and commit"; exit 1
  fi
else
  echo "(not a git repository — skipping schemas drift check)"
fi

step "P0 real-git publication smoke"; node scripts/smoke-realgit.mjs

step "dashboard artifact + Pages base-path smoke"
# Simulate a project Pages site so the base path (/<repo>/) is exercised end to end.
export GITHUB_ACTIONS=true GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-local/starledger}"
TMP_DATA="$(mktemp -d)"
trap 'rm -rf "$TMP_DATA"' EXIT
pnpm -s --filter @starred/dashboard build
pnpm -s exec tsx packages/deploy/src/cli.ts fixture --out "$TMP_DATA"
pnpm -s exec tsx packages/deploy/src/cli.ts stage --data "$TMP_DATA" --dist apps/dashboard/dist
pnpm -s exec tsx packages/deploy/src/cli.ts verify --dist apps/dashboard/dist
pnpm -s exec tsx packages/deploy/src/cli.ts smoke --dist apps/dashboard/dist

printf '\n\033[1;32mP1 release gate passed.\033[0m\n'
