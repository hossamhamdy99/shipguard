# ShipGuard — HANDOFF

Orientation and durable memory for the next session. ShipGuard is a toolkit of deploy-safety
checks that catch changes which are valid but silently wrong. The code is self-documenting:
each guard's header comment names the concrete failure that shaped it — start there, not here.

Layout: `src/` holds the checks (`verdict`, `review-gate`, `run-tests`, `unwired-exports`),
re-exported from `src/index.mjs`; `test/` has one standalone `*.test.mjs` per check, all run by
`node test/all.mjs` (`npm test`); `bin/shipguard.mjs` is the CLI; `hooks/` is the pre-push
(build + secret scan); `REVIEWS/` holds the committed reviews the gate reads; CI runs the suite
on Node 18/20/22.

Hard rule: this repo is public and product-neutral — it names no private project it was drawn
from. Keep it that way in code, comments, tests, and history.

## Session — 2026-08-06

I added a new check, **unwired-exports** (`src/unwired-exports.mjs` + test, wired into
`index.mjs` and `test/all.mjs`): it flags exports that are defined and tested but called by
nothing in production. Comments are stripped before matching, because a name in a comment is not
a call; a use inside the same file counts as wired so it does not cry wolf. I neutered
`stripComments` as a mutation test and the suite went red on exactly the comment-mentioned
fixture — so the check bites.

I closed **hole 4** in the review gate (`src/review-gate.mjs`): the `reviewed === head` fast path
returned green without ever reading the working tree, so a risky file edited-but-uncommitted or
untracked shipped unreviewed. It now scans the working tree and refuses any dirty risky path
(reason `risky-uncommitted`), and runs git with `core.quotepath=false` so non-ASCII paths are
seen. I mutation-tested both: neuter the guard, or revert quotepath, and the gate test goes red
on exactly those cases.

## Stopping point

Everything above is committed and pushed; `npm test` is green (6 passed · 0 failed). Nothing is
half-finished — the next session starts clean.
