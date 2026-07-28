#!/usr/bin/env bash
# Refuse to commit a key.
#
# Scans what is STAGED, not the working tree — the working tree can hold a local `.env` that
# is correctly gitignored, and flagging it teaches people to pass `--no-verify`, which
# disables every hook including the ones that matter.
set -uo pipefail

FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
[ -z "$FILES" ] && exit 0

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
for f in $FILES; do
  [ -f "$f" ] || continue
  case "$f" in
    *.lock|*.min.js|*.map|*.png|*.jpg|*.jpeg|*.gif|*.pdf|*.woff*) continue ;;
    # An example file is meant to carry placeholders.
    *.example|*.example.*|*.sample|*.sample.*) continue ;;
  esac
  for p in "${PATTERNS[@]}"; do
    if HIT=$(git show ":$f" 2>/dev/null | grep -nE "$p" | head -3); then
      [ -z "$HIT" ] && continue
      echo "❌ possible secret in staged file: $f"
      # Print the line NUMBER and a redacted excerpt — never the key itself. A hook that
      # echoes the secret has just written it to your terminal scrollback and your CI log.
      echo "$HIT" | sed -E 's/(.{0,12}).*/   line \1… [redacted]/'
      FOUND=1
    fi
  done
done

if [ "$FOUND" = 1 ]; then
  echo ""
  echo "   If it is a real key: rotate it. Removing the commit does not un-leak it."
  echo "   If it is a false positive: rename the file to *.example, or set SHIPGUARD_SKIP=1"
  echo "   for this one push and say so in the commit message."
  exit 1
fi
exit 0
