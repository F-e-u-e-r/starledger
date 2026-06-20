#!/usr/bin/env bash
# P3.0 contracts gate:
#
#   typecheck · lint · format check · tests · build
#   · AI JSON Schema generation + drift check
#
# P3.0 is contracts and deterministic agent-boundary scaffold only. README
# discovery, scheduling, publication, and dashboard smokes land later.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

step "typecheck"; pnpm -s typecheck
step "lint"; pnpm -s lint
step "format check"; pnpm -s format:check
step "test"; pnpm -s test
step "build"; pnpm -s build

step "schemas (regenerate + verify clean)"
pnpm -s schemas
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if ! git diff --quiet -- schemas; then
    echo "schemas/ is out of date — run 'pnpm schemas' and commit"
    exit 1
  fi
else
  echo "(not a git repository — skipping schemas drift check)"
fi

printf '\n\033[1;32mP3.0 contracts gate passed.\033[0m\n'
