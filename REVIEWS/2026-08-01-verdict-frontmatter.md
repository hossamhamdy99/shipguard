---
reviewed-through: f08efb017c73
verdict: ship
---

# Independent review — frontmatter verdict, secret scanner, migration helper

Reviewed by an adversarial tester run independently of the author
(`.claude/agents/shipguard-tester.md`), under the repo's rule: the first question about a guard
is whether it can report success while blind. Everything below was executed, not read.

## Verified by the independent reviewer, end-to-end
- The verdict is read only from the leading frontmatter block; the body is never parsed. Every
  documented / fenced / nested / unclosed / indented / quoted / mis-positioned example was driven
  through `shipguard check` and **refused** (exit 1); a genuine frontmatter approval **passes**.
- Verdict tricks and moving-ref `reviewed-through` values fail safe; conflicts resolve to no-ship.
- Mutation test: dropping the frontmatter position anchor makes the suite fail.
- Secret scanner: the private-key pattern executes and catches; space / unicode / newline
  filenames are caught.

## Author-attested increments (test-covered, run green; not re-run by the independent tester)
- A trailing YAML `# comment` on a value is now stripped, so `verdict: ship # or: no-ship` reads
  as `ship` — the docs are copy-safe. An unrecognised value still fails closed as `unreadable`.
- `bin/migrate-reviews.mjs` moves `reviewed-through:` into frontmatter and DELIBERATELY never
  writes `verdict:`, so a migrated-but-unjudged review stays `unreadable` and a human decides.
  `test/migrate-reviews.test.mjs` asserts it never writes a verdict — the one thing it must not do.

## Notes (non-blocking)
- `REVIEWS/README.md` is correctly ignored (no frontmatter `reviewed-through`).

5 suites · 0 failed · 0 skipped. Repo is English-only. The verdict is declared in the frontmatter above.
