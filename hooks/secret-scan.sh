#!/usr/bin/env bash
# Refuse to commit a key.
#
# Scans what is STAGED, not the working tree — the working tree can hold a local `.env` that
# is correctly gitignored, and flagging it teaches people to pass `--no-verify`, which
# disables every hook including the ones that matter.
set -uo pipefail

# Patterns are deliberately few and specific. A scanner that cries wolf gets bypassed, and a
# bypassed scanner is worse than none — you believe you are covered.
PATTERNS=(
  'sk-[A-Za-z0-9]{32,}'                        # OpenAI-style
  'sk_live_[A-Za-z0-9]{16,}'                   # Stripe live
  'AKIA[0-9A-Z]{16}'                           # AWS access key id
  'ghp_[A-Za-z0-9]{36}'                        # GitHub PAT
  'eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.'   # a JWT with a real signature
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
  'SERVICE_ROLE_KEY\s*[:=]\s*["'"'"']?eyJ'     # a service-role key with a value, not a name
)

FOUND=0
# ── Read the staged paths NUL-delimited, one per iteration ──────────────────────────
# `for f in $(git diff --cached --name-only)` split the list on whitespace, so a staged
# `my key.txt` became `my` + `key.txt`: the real file — the one that might hold the key — was
# never scanned, while a space-free copy was caught (and, from the split, scanned twice).
# Found by running it against a file named with a space, not by reading the loop.
while IFS= read -r -d '' f; do
  [ -f "$f" ] || continue
  case "$f" in
    *.lock|*.min.js|*.map|*.png|*.jpg|*.jpeg|*.gif|*.pdf|*.woff*) continue ;;
    # An example file is meant to carry placeholders.
    *.example|*.example.*|*.sample|*.sample.*) continue ;;
  esac
  for p in "${PATTERNS[@]}"; do
    # `grep -nE -e "$p"`, NOT `grep -nE "$p"`. The `-----BEGIN … PRIVATE KEY-----` pattern
    # begins with dashes, and without `-e` grep read them as options: it errored to stderr
    # and the pattern never ran, so a staged private key passed while the scanner said clean.
    # The one secret you can least afford to leak was the one pattern that never executed.
    # `-e` tells grep the next argument is a pattern, dashes and all. Found by running it.
    if HIT=$(git show ":$f" 2>/dev/null | grep -nE -e "$p" | head -3); then
      [ -z "$HIT" ] && continue
      echo "❌ possible secret in staged file: $f"
      # Print the line NUMBER and a redacted excerpt — never the key itself. A hook that
      # echoes the secret has just written it to your terminal scrollback and your CI log.
      echo "$HIT" | sed -E 's/(.{0,12}).*/   line \1… [redacted]/'
      FOUND=1
    fi
  done
done < <(git diff --cached -z --name-only --diff-filter=ACM 2>/dev/null)

if [ "$FOUND" = 1 ]; then
  echo ""
  echo "   If it is a real key: rotate it. Removing the commit does not un-leak it."
  echo "   If it is a false positive: rename the file to *.example, or set SHIPGUARD_SKIP=1"
  echo "   for this one push and say so in the commit message."
  exit 1
fi
exit 0
