---
reviewed-through: e510ea96fbf3
verdict: ship
---

# Independent review — frontmatter verdict + secret scanner

Reviewed by an adversarial tester run independently of the author (see
`.claude/agents/shipguard-tester.md`), under the repo's rule: the first question about a guard
is whether it can report success while blind. Everything below was executed, not read.

## Verified by running
- The verdict is read only from the leading frontmatter block; the body is never parsed. Every
  documented / fenced / nested / unclosed / indented / quoted / mis-positioned example of the
  block was driven end-to-end through `shipguard check` and **refused** (exit 1); a genuine
  leading-frontmatter approval **passes** (exit 0).
- Verdict tricks (`main`, `ship!`, quoted, trailing comment, homoglyph, double-space) and
  moving-ref `reviewed-through` values fail safe; conflicting verdicts resolve to no-ship.
- Mutation test: dropping the frontmatter position anchor makes the suite fail — the tests bite.
- Secret scanner: the private-key pattern executes and catches; keys in space / unicode /
  newline filenames are caught.
- 4 suites · 0 failed · 0 skipped. Repo is English-only.

## History it closes
The prior prose parser false-approved a modifier-form rejection (measured: a review that said
the total was wrong billed the customer → exit 0). Two intermediate inline-marker designs were
each broken by a fence shape the tester found. Frontmatter removes the class: there is no code
context to model, because the body is not read.

## Notes (non-blocking)
- `REVIEWS/README.md` is correctly ignored (no frontmatter `reviewed-through`).
- Downstream must add a frontmatter block to each existing review
  before adopting this version — done in those projects, not here.

The verdict is declared in the frontmatter above.
