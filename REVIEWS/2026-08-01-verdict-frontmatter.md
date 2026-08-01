---
reviewed-through: e4c356718a43
verdict: ship
---

# Independent review — frontmatter verdict + secret scanner

Reviewed by an adversarial tester run independently of the author
(`.claude/agents/shipguard-tester.md`), under the repo's rule: the first question about a guard
is whether it can report success while blind. Everything below was executed, not read.

## Verified by the independent reviewer, end-to-end
- The verdict is read only from the leading frontmatter block; the body is never parsed. Every
  documented / fenced / nested / unclosed / indented / quoted / mis-positioned example of the
  block was driven through `shipguard check` and **refused** (exit 1); a genuine leading-
  frontmatter approval **passes** (exit 0).
- Verdict tricks (`main`, `ship!`, quoted, homoglyph) and moving-ref `reviewed-through` values
  fail safe; conflicting verdicts resolve to no-ship.
- Mutation test: dropping the frontmatter position anchor makes the suite fail.
- Secret scanner: the private-key pattern executes and catches; keys in space / unicode /
  newline filenames are caught.

## Author-attested increment (test-covered, run green)
After that review, a second reviewer flagged that `verdict: ship (or: no-ship)` or a trailing
`# comment` parsed as the literal value and read as `unreadable` — a copy-from-the-docs footgun
(fails closed, not a false ship). Fixed: the parser strips a trailing YAML `# comment`; the docs
and gate message are now copy-safe. Covered by new tests, run green. This one-line increment is
attested by the author, not re-run by the independent tester.

## Notes (non-blocking)
- `REVIEWS/README.md` is correctly ignored (no frontmatter `reviewed-through`).
- Downstream projects must add a frontmatter block to each existing review before adopting.

4 suites · 0 failed · 0 skipped. Repo is English-only. The verdict is declared in the
frontmatter above.
