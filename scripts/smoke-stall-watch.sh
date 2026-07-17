#!/usr/bin/env bash
# smoke-stall-watch — hermetic fixture test for scripts/ai-stall-watch.sh.
#
# Runs the watchdog against a stub `gh`/`curl` on PATH (no network, no secrets),
# covering: the executor-PR predicate (branch prefix + exact artifact path via
# paginated files), the age threshold, the check-state machine (green allowlist —
# a `stale` conclusion is a failure; pending precedence incl. zero check runs),
# state-dependent operator advice, dry-run vs send ordering, Telegram ok:true
# validation, missing-secret failure, and parameter validation. CI runs this in
# the smoke step; it is also the local acceptance gate for the watchdog.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/stall-watch-smoke.XXXXXX")"
trap 'rm -rf "$work"' EXIT
bin="$work/bin"
fixtures="$work/fixtures"
mkdir -p "$bin" "$fixtures"

command -v jq >/dev/null || { echo 'smoke-stall-watch: jq is required' >&2; exit 1; }

iso_ago() { # $1 hours ago → ISO-8601 UTC
  date -u -d "$1 hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
    || date -u -v"-$1H" +%Y-%m-%dT%H:%M:%SZ
}

# --- fixtures ---------------------------------------------------------------
# API-SHAPED fixtures (the stub runs the CALLER's --jq for real).
# Two PAGES of open PRs: dropping --paginate from the pulls call would lose
# page 2 entirely, so the page-2 PRs' assertions lock the pagination in.
# 101 prefix-match, 4h old, red solely on verify-ai-provenance
# 102 files-match (exact ai-annotations.json), 9h old, `stale` conclusion → failure
# 103 unrelated branch and files (incl. a hostile newline filename) → excluded
# 104 prefix-match but too young for the 2h threshold
# 105 prefix-match, 3h old, one check still in_progress → pending      (page 2)
# 106 prefix-match, 3h old, zero check runs yet → pending              (page 2)
# 107 prefix-match, 3h old, success+neutral+skipped → all-green        (page 2)
# 108 files-match ONLY via previous_filename (renamed away), 5h old    (page 2)
# 109 unrelated; its files call can be forced to FAIL (fail-closed case)
jq -n \
  --arg t101 "$(iso_ago 4)" --arg t102 "$(iso_ago 9)" --arg t103 "$(iso_ago 9)" \
  --arg t104 "$(iso_ago 0)" '
[
  {number:101, title:"feat(ai): add AI annotations (t <b>itle</b> is untrusted)", created_at:$t101,
   head:{ref:"claude/p3-ai-artifact-20260701-000000-1", sha:"shared"}, html_url:"https://example.test/pr/101"},
  {number:102, title:"chore: hand-edited artifact", created_at:$t102,
   head:{ref:"fix/manual-artifact-touch", sha:"shastale"}, html_url:"https://example.test/pr/102"},
  {number:103, title:"docs: unrelated", created_at:$t103,
   head:{ref:"docs/unrelated", sha:"shadocs"}, html_url:"https://example.test/pr/103"},
  {number:104, title:"feat(ai): fresh executor PR", created_at:$t104,
   head:{ref:"claude/p3-ai-artifact-20260717-090000-9", sha:"shayoung"}, html_url:"https://example.test/pr/104"}
]' > "$fixtures/pulls-page1.json"
jq -n \
  --arg t105 "$(iso_ago 3)" --arg t108 "$(iso_ago 5)" --arg t109 "$(iso_ago 9)" '
[
  {number:105, title:"feat(ai): checks running", created_at:$t105,
   head:{ref:"claude/p3-ai-artifact-20260616-000000-5", sha:"shapend"}, html_url:"https://example.test/pr/105"},
  {number:106, title:"feat(ai): no checks yet", created_at:$t105,
   head:{ref:"claude/p3-ai-artifact-20260616-000000-6", sha:"shanone"}, html_url:"https://example.test/pr/106"},
  {number:107, title:"feat(ai): green but unmerged", created_at:$t105,
   head:{ref:"claude/p3-ai-artifact-20260616-000000-7", sha:"shagreen"}, html_url:"https://example.test/pr/107"},
  {number:108, title:"refactor: rename the artifact away", created_at:$t108,
   head:{ref:"refactor/rename-artifact", sha:"sharenam"}, html_url:"https://example.test/pr/108"},
  {number:109, title:"chore: files API may fail here", created_at:$t109,
   head:{ref:"chore/api-error-probe", sha:"shaerror"}, html_url:"https://example.test/pr/109"}
]' > "$fixtures/pulls-page2.json"

jq -n '{check_runs:[{name:"verify",status:"completed",conclusion:"success"},
        {name:"verify-ai-provenance",status:"completed",conclusion:"failure"},
        {name:"verify-agent-artifacts",status:"completed",conclusion:"success"}]}' \
  > "$fixtures/checks-shared.json"
jq -n '{check_runs:[{name:"verify",status:"completed",conclusion:"success"},
        {name:"verify-agent-artifacts",status:"completed",conclusion:"stale"}]}' \
  > "$fixtures/checks-shastale.json"
jq -n '{check_runs:[{name:"verify",status:"in_progress",conclusion:null},
        {name:"verify-agent-artifacts",status:"completed",conclusion:"success"}]}' \
  > "$fixtures/checks-shapend.json"
jq -n '{check_runs:[]}' > "$fixtures/checks-shanone.json"
# The full green ALLOWLIST in one place: success, neutral, AND skipped.
jq -n '{check_runs:[{name:"verify",status:"completed",conclusion:"success"},
        {name:"verify-agent-artifacts",status:"completed",conclusion:"neutral"},
        {name:"optional-extra",status:"completed",conclusion:"skipped"}]}' \
  > "$fixtures/checks-shagreen.json"
jq -n '{check_runs:[{name:"verify",status:"completed",conclusion:"failure"}]}' \
  > "$fixtures/checks-sharenam.json"

# File lists are JSON (the stub runs the CALLER's --jq over them, so the real
# filename/previous_filename logic is exercised, not bypassed). 103 carries a
# hostile filename embedding a newline + the canonical name: a line-oriented
# grep would false-match it; the in-jq field comparison must not. 108's page 2
# holds the rename-away record (previous_filename) — also proving the files
# call paginates. 109 is empty unless FILES_109_FAIL forces an API error.
jq -n '[{filename:"ai-annotations.json", previous_filename:null},
        {filename:"ai-annotations-meta.json", previous_filename:null}]' \
  > "$fixtures/files-102-page1.json"
jq -n '[{filename:"docs/notes.md"},
        {filename:"some/dir/ai-annotations.json.bak"},
        {filename:"evil\nai-annotations.json"}]' \
  > "$fixtures/files-103-page1.json"
jq -n '[{filename:"docs/unrelated-first-page.md"}]' > "$fixtures/files-108-page1.json"
jq -n '[{filename:"ai-annotations-v2.json", previous_filename:"ai-annotations.json", status:"renamed"}]' \
  > "$fixtures/files-108-page2.json"
jq -n '[]' > "$fixtures/files-109-page1.json"

# --- stubs ------------------------------------------------------------------
cat > "$bin/gh" <<STUB
#!/usr/bin/env bash
# stub gh: serve fixture JSON for the exact API shapes ai-stall-watch.sh uses,
# and run the CALLER's --jq expression over it with the real jq — so the
# script's own field logic (filename vs previous_filename, pagination merge) is
# exercised, never bypassed. Only with --paginate does page 2 get served:
# dropping --paginate in the script under test loses page-2 fixtures and their
# assertions go red. check-runs fixtures are single-page (their pagination is
# not locked by this stub).
set -euo pipefail
url='' jqexpr='' paginate='false' grab=''
for a in "\$@"; do
  if [[ "\$grab" == 'jq' ]]; then jqexpr="\$a"; grab=''; continue; fi
  case "\$a" in
    repos/*) url="\$a" ;;
    --jq) grab='jq' ;;
    --paginate) paginate='true' ;;
  esac
done
emit() { # \$1 fixture file — apply the caller's jq like gh does
  if [[ -n "\$jqexpr" ]]; then jq -r "\$jqexpr" "\$1"; else cat "\$1"; fi
}
serve_pages() { # \$1 fixture basename; page 2 exists only for some fixtures
  emit "$fixtures/\$1-page1.json"
  if [[ "\$paginate" == 'true' && -f "$fixtures/\$1-page2.json" ]]; then
    emit "$fixtures/\$1-page2.json"
  fi
}
case "\$url" in
  */pulls\?state=open*) serve_pages pulls ;;
  */pulls/109/files)
    if [[ "\${FILES_109_FAIL:-}" == '1' ]]; then echo 'stub gh: HTTP 502' >&2; exit 22; fi
    serve_pages files-109 ;;
  */pulls/102/files) serve_pages files-102 ;;
  */pulls/103/files) serve_pages files-103 ;;
  */pulls/108/files) serve_pages files-108 ;;
  */pulls/*/files) echo "stub gh: unexpected files call: \$url" >&2; exit 64 ;;
  */commits/*/check-runs*)
    sha="\${url##*/commits/}"; sha="\${sha%%/*}"
    emit "$fixtures/checks-\$sha.json" ;;
  *) echo "stub gh: unexpected url \$url" >&2; exit 64 ;;
esac
STUB
cat > "$bin/curl" <<STUB
#!/usr/bin/env bash
# stub curl: record the send, emit a Telegram-shaped response.
set -euo pipefail
printf '%s\n' "\$@" >> "$fixtures/curl-called.txt"
if [[ "\${TELEGRAM_FAKE_FAIL:-}" == '1' ]]; then echo '{"ok":false,"description":"nope"}'; else echo '{"ok":true}'; fi
STUB
chmod +x "$bin/gh" "$bin/curl"

run_watch() { # env overrides as KEY=VALUE args, then expected exit code
  local expect="$1"; shift
  local out rc=0
  out="$(env PATH="$bin:$PATH" GH_REPO=example/fixture "$@" \
    bash "$root/scripts/ai-stall-watch.sh" 2>&1)" || rc=$?
  if [[ "$rc" != "$expect" ]]; then
    echo "FAIL: expected exit $expect, got $rc; output:" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  printf '%s' "$out"
}

assert_contains() { # haystack, needle, label
  if ! grep -qF "$2" <<<"$1"; then
    echo "FAIL: $3 — missing: $2" >&2
    printf -- '--- output ---\n%s\n' "$1" >&2
    exit 1
  fi
}
assert_not_contains() {
  if grep -qF "$2" <<<"$1"; then
    echo "FAIL: $3 — unexpectedly present: $2" >&2
    printf -- '--- output ---\n%s\n' "$1" >&2
    exit 1
  fi
}

# 1) dry run: detection, states, advice; no curl
out="$(run_watch 0 STALL_HOURS=2 DRY_RUN=true)"
assert_contains "$out" 'DRY_RUN — would send' 'dry-run banner'
assert_contains "$out" 'PR #101' 'prefix-matched stalled PR detected'
assert_contains "$out" 'red on verify-ai-provenance only' 'sole-provenance advice'
assert_contains "$out" 'PR #102' 'file-matched stalled PR detected'
assert_contains "$out" 'verify-agent-artifacts: stale' 'stale conclusion surfaced'
assert_contains "$out" 'CLOSE the PR (never hand-merge); the next hourly run re-plans' 'generic red advice (stale ≠ green)'
assert_not_contains "$out" 'PR #103' 'non-executor PR excluded'
assert_not_contains "$out" 'PR #104' 'young PR excluded by threshold'
assert_contains "$out" 'PR #105' 'pending PR detected'
assert_contains "$out" 'checks still running' 'pending advice (no close)'
assert_contains "$out" 'PR #106' 'zero-check-runs PR detected'
assert_contains "$out" 'PR #107' 'all-green stalled PR detected'
assert_contains "$out" 'green but unmerged — auto-merge did not fire' 'all-green advice (allowlist positive path)'
assert_contains "$out" 'PR #108' 'rename-away PR detected via previous_filename on page 2'
assert_not_contains "$out" 'PR #109' 'empty-files PR excluded'
[[ ! -f "$fixtures/curl-called.txt" ]] || { echo 'FAIL: dry run must not call curl' >&2; exit 1; }

# 2) send path: curl called once, ok:true accepted, chat_id + text forwarded
out="$(run_watch 0 STALL_HOURS=2 DRY_RUN=false TELEGRAM_BOT_TOKEN=tok TELEGRAM_CHAT_ID=chat42)"
assert_contains "$out" 'alert sent for 6 stalled executor PR(s)' 'send-path success line'
[[ -f "$fixtures/curl-called.txt" ]] || { echo 'FAIL: send path never called curl' >&2; exit 1; }
sent="$(cat "$fixtures/curl-called.txt")"
assert_contains "$sent" 'chat_id=chat42' 'chat id forwarded'
assert_contains "$sent" 'PR #101' 'message text forwarded'

# 3) Telegram ok:false → exit 1
out="$(run_watch 1 STALL_HOURS=2 DRY_RUN=false TELEGRAM_BOT_TOKEN=tok TELEGRAM_CHAT_ID=chat42 TELEGRAM_FAKE_FAIL=1)"
assert_contains "$out" 'Telegram rejected the message' 'ok:false rejected'

# 4) stall + missing secrets → exit 1 (undeliverable real alert is red)
out="$(run_watch 1 STALL_HOURS=2 DRY_RUN=false TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID=)"
assert_contains "$out" 'Telegram secrets are missing' 'missing-secret failure'

# 5) nothing stalled → exit 0 without secrets
out="$(run_watch 0 STALL_HOURS=9999 DRY_RUN=false TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID=)"
assert_contains "$out" 'no stalled executor PR' 'quiet path'

# 6) parameter validation → exit 2
out="$(run_watch 2 STALL_HOURS=abc DRY_RUN=true)"
assert_contains "$out" 'STALL_HOURS must be a nonnegative integer' 'stall-hours validation'
out="$(run_watch 2 STALL_HOURS=20000 DRY_RUN=true)"
assert_contains "$out" 'at most 4 digits' 'stall-hours length cap'
out="$(run_watch 2 STALL_HOURS=2 DRY_RUN=banana)"
assert_contains "$out" "DRY_RUN must be exactly 'true' or 'false'" 'dry-run validation'

# 7) octal-looking input ("08") must behave as decimal 8, not abort every PR:
# at an 8h threshold the 9h-old executor PR #102 MUST be detected. The regression
# (bash rejecting "08" as octal inside (( )) and the error being swallowed by
# `|| continue`) skips every PR and prints "no stalled" with a clean exit 0 —
# so asserting a hit here is what distinguishes correct from broken. Note "04"
# would NOT discriminate: 0-7 digits are VALID octal with the same value.
out="$(run_watch 0 STALL_HOURS=08 DRY_RUN=true)"
assert_contains "$out" 'PR #102' 'leading-zero threshold parsed as decimal (regression guard)'
assert_not_contains "$out" 'PR #105' 'younger PR still below the decimal threshold'

# 8) files API failure must fail CLOSED (kill the run with the underlying
# tool's nonzero code — the stub uses 22) — never silently classify the PR as
# non-executor and report a clean "no stalled"/partial sweep.
out="$(run_watch 22 STALL_HOURS=2 DRY_RUN=true FILES_109_FAIL=1)"
assert_contains "$out" 'stub gh: HTTP 502' 'files API failure surfaced'
assert_not_contains "$out" 'alert sent' 'no alert claim on a failed sweep'

echo 'smoke-stall-watch: all assertions passed'
