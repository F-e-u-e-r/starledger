#!/usr/bin/env bash
# P0 release gate (P0.6.3). Runs the full quality + safety suite against the
# built artifact. Any failure aborts before anything publishable is produced.
#
#   typecheck · lint · test · build · schemas · real-git publication smoke
#
# A public-only PAT smoke runs only when STAR_SYNC_TOKEN is set (CI credential
# hygiene); it must observe private_filtered == 0.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

step "typecheck"; pnpm -s typecheck
step "lint";      pnpm -s lint
step "test";      pnpm -s test
step "build";     pnpm -s build
step "schemas (regenerate + verify clean)"
pnpm -s schemas
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if ! git diff --quiet -- schemas; then
    echo "schemas/ is out of date — run 'pnpm schemas' and commit"; exit 1
  fi
else
  echo "(not a git repository — skipping schemas drift check)"
fi

step "real-git publication smoke"; node scripts/smoke-realgit.mjs

if [[ -n "${STAR_SYNC_TOKEN:-}" ]]; then
  step "public-only PAT smoke (private_filtered must be 0)"
  node scripts/smoke-public-pat.mjs
else
  step "public-only PAT smoke"; echo "skipped (STAR_SYNC_TOKEN not set)"
fi

printf '\n\033[1;32mP0 release gate passed.\033[0m\n'
