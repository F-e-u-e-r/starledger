#!/usr/bin/env bash
# ai-stall-watch — page the operator when an open executor PR has stalled the
# hourly AI-classification campaign.
#
# WHY: the routine's STEP-0 throttle skips every hourly run while ANY open PR
# either has a `claude/p3-ai-artifact-*` head branch or changes
# ai-annotations.json (fork PRs included). That is the designed fail-safe, but
# it is silent: on 2026-07-16 a gate-red executor PR (#91) stalled the campaign
# for ~13h before a human noticed. This script turns that state into a page.
#
# Contract (env only; NO positional args):
#   GH_REPO             owner/repo (required)
#   GH_TOKEN            token for `gh api` (provided by Actions; ambient locally)
#   STALL_HOURS         alert when an executor PR is open longer than this (default 2)
#   DRY_RUN             exactly "true" or "false" (default false); true prints
#                       the composed alert instead of sending it and needs no secrets
#   TELEGRAM_BOT_TOKEN  \ required only when a stall is found and DRY_RUN=false;
#   TELEGRAM_CHAT_ID    / an undeliverable REAL alert exits 1 (red run), never silent
#
# Exit codes: 0 ok (alerted, dry-ran, or nothing stalled), 1 delivery failure,
# 2 invalid parameters. Read-only against GitHub; PR titles are treated as
# untrusted data (composed via jq, never shell-interpolated).
set -euo pipefail

GH_REPO="${GH_REPO:?GH_REPO (owner/repo) is required}"
STALL_HOURS="${STALL_HOURS:-2}"
DRY_RUN="${DRY_RUN:-false}"

if ! [[ "$STALL_HOURS" =~ ^[0-9]{1,4}$ ]]; then
  echo "ai-stall-watch: STALL_HOURS must be a nonnegative integer of at most 4 digits, got: $STALL_HOURS" >&2
  exit 2
fi
# Force base-10 BEFORE any arithmetic: a leading zero ("08") would otherwise be
# parsed as octal inside (( )), abort the age comparison, and get swallowed by
# its `|| continue` — silently skipping every stalled PR with a clean exit 0.
STALL_HOURS=$((10#$STALL_HOURS))
if [[ "$DRY_RUN" != 'true' && "$DRY_RUN" != 'false' ]]; then
  echo "ai-stall-watch: DRY_RUN must be exactly 'true' or 'false', got: $DRY_RUN" >&2
  exit 2
fi

now_epoch="$(date -u +%s)"

# Epoch seconds for an ISO-8601 UTC timestamp, GNU date first, BSD fallback.
iso_to_epoch() {
  date -u -d "$1" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$1" +%s
}

# Every open PR, NO base filter: the routine throttle blocks on any open
# executor-shaped PR regardless of its base branch, so the watchdog mirrors it.
open_prs="$(
  gh api --paginate "repos/$GH_REPO/pulls?state=open&per_page=100" \
    --jq '[.[] | {number, title, created_at, head_ref: .head.ref, head_sha: .head.sha, url: .html_url}]' \
    | jq -s 'add // []'
)"
open_count="$(jq 'length' <<<"$open_prs")"

stalled='[]'
for ((i = 0; i < open_count; i++)); do
  pr="$(jq ".[$i]" <<<"$open_prs")"
  number="$(jq -r '.number' <<<"$pr")"
  head_ref="$(jq -r '.head_ref' <<<"$pr")"
  head_sha="$(jq -r '.head_sha' <<<"$pr")"
  created_at="$(jq -r '.created_at' <<<"$pr")"

  # Executor predicate (mirrors routine STEP-0): branch prefix, or the PR's
  # (paginated — default page is 30 files) file list touching the exact
  # canonical artifact path. Renames count too: a rename away from the artifact
  # still changes it, so the old path arrives via previous_filename.
  is_executor='false'
  if [[ "$head_ref" == claude/p3-ai-artifact-* ]]; then
    is_executor='true'
  else
    # Fail CLOSED and SIGPIPE-safe: capture the whole (paginated) answer first —
    # an API failure kills the run loudly (set -e) instead of silently
    # classifying the PR as non-executor, and nothing here can SIGPIPE gh
    # mid-pagination the way `gh | grep -q` could. The path comparison happens
    # INSIDE jq on the JSON fields, so a hostile filename containing a newline
    # cannot forge a matching line the way a raw line-oriented grep allowed.
    artifact_hits="$(
      gh api --paginate "repos/$GH_REPO/pulls/$number/files" \
        --jq 'any(.[]; .filename == "ai-annotations.json" or .previous_filename == "ai-annotations.json")'
    )"
    # --paginate emits one true/false per page; any page's true is a hit.
    if grep -qx 'true' <<<"$artifact_hits"; then
      is_executor='true'
    fi
  fi
  [[ "$is_executor" == 'true' ]] || continue

  created_epoch="$(iso_to_epoch "$created_at")"
  age_seconds=$((now_epoch - created_epoch))
  ((age_seconds > STALL_HOURS * 3600)) || continue
  age_hours=$((age_seconds / 3600))

  checks_json="$(
    gh api --paginate "repos/$GH_REPO/commits/$head_sha/check-runs?per_page=100" \
      --jq '[.check_runs[] | {name, status, conclusion}]' | jq -s 'add // []'
  )"
  # State precedence: pending if there are no check runs yet or any run is
  # non-terminal; else green ONLY for the allowlist success|neutral|skipped
  # (any other terminal conclusion — failure, cancelled, timed_out,
  # action_required, stale, … — counts as a failure); else has-failures.
  state="$(jq -r '
    if length == 0 then "pending"
    elif any(.[]; .status != "completed") then "pending"
    elif all(.[]; (.conclusion // "") as $c | $c == "success" or $c == "neutral" or $c == "skipped")
      then "all-green"
    else "has-failures" end
  ' <<<"$checks_json")"
  failing_names="$(jq -r '
    [.[]
     | select(.status == "completed")
     | select((.conclusion // "") as $c | ($c == "success" or $c == "neutral" or $c == "skipped") | not)
     | .name] | unique | join(",")
  ' <<<"$checks_json")"
  check_summary="$(jq -r '
    [.[] | "\(.name): \(if .status != "completed" then .status else (.conclusion // "unknown") end)"]
    | join("; ")
  ' <<<"$checks_json")"

  # Operator guidance per the routine spec's operating rules. Never advise
  # closing while checks are still running; never advise a manual merge.
  case "$state" in
    all-green)
      advice='green but unmerged — auto-merge did not fire; investigate, and close it if it cannot merge' ;;
    has-failures)
      if [[ "$failing_names" == 'verify-ai-provenance' ]]; then
        # Wording constraint: workflow/script files must not mention the manual
        # re-stamp command by name (a guard test enforces it stays un-automated),
        # so point at the runbook procedure instead.
        advice='red on verify-ai-provenance only — if the violations are dataset-staleness (PROV-5) alone, re-stamp via the MANUAL runbook procedure; otherwise CLOSE the PR (never hand-merge)'
      else
        advice='red — CLOSE the PR (never hand-merge); the next hourly run re-plans'
      fi ;;
    *)
      advice='checks still running — if this persists across watch runs, inspect the check runs' ;;
  esac

  stalled="$(
    jq --argjson pr "$pr" --argjson age "$age_hours" \
      --arg state "$state" --arg checks "$check_summary" --arg advice "$advice" \
      '. + [{pr: $pr, age_h: $age, state: $state, checks: $checks, advice: $advice}]' <<<"$stalled"
  )"
done

stalled_count="$(jq 'length' <<<"$stalled")"
if ((stalled_count == 0)); then
  echo "ai-stall-watch: no stalled executor PR (checked $open_count open PRs, threshold ${STALL_HOURS}h)"
  exit 0
fi

# Compose from API JSON only — PR titles never pass through the shell.
message="$(jq -r --arg repo "$GH_REPO" '
  ["⚠️ StarLedger AI pipeline stalled — \($repo)",
   "Open executor PR(s) block the hourly routine (STEP-0):",
   ""]
  + [.[] | "• PR #\(.pr.number) \(.pr.url)\n  \(.pr.title)\n  open \(.age_h)h — \(if .checks == "" then "no checks reported" else .checks end)\n  → \(.advice)"]
  + ["", "Runbook: docs/routines/starledger-ai-classification.md → Operating rules"]
  | join("\n")
' <<<"$stalled")"
if ((${#message} > 3900)); then
  message="${message:0:3900}…(truncated)"
fi

if [[ "$DRY_RUN" == 'true' ]]; then
  echo "ai-stall-watch DRY_RUN — would send:"
  printf '%s\n' "$message"
  exit 0
fi

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  echo 'ai-stall-watch: stall detected but Telegram secrets are missing — cannot deliver the alert' >&2
  exit 1
fi
if ! response="$(
  curl -sS --fail-with-body --max-time 30 -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${message}"
)"; then
  echo "ai-stall-watch: Telegram API call failed: $response" >&2
  exit 1
fi
if ! jq -e '.ok == true' <<<"$response" >/dev/null; then
  echo "ai-stall-watch: Telegram rejected the message: $response" >&2
  exit 1
fi
echo "ai-stall-watch: alert sent for $stalled_count stalled executor PR(s)"
