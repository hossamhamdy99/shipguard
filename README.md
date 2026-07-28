# shipguard

**Checks that can actually stop a deploy — and that are tested for whether they can pass while blind.**

A check nobody runs is not a check. A check that reports green because it is broken is worse
than no check, because it teaches you that green means safe.

```bash
npm i -D shipguard
npx shipguard init
```

---

## Why this exists

Two numbers from the production SaaS it was extracted from, both measured, both over one week:

- **Five production bugs found by clicking a button.** Every automated check was green at the
  time — types, lint, 13 test suites, a database gate with 17 checks. Two more were found by
  an independent human review, also green. The bugs were things like: a stocktake that wrote
  its adjustments to the audit log with no reason attached, a "purchases this month" figure
  that was short by 15,600 because partial deliveries were excluded, and 40 units of stock
  stranded in a status nothing handled.
- **The review gate itself was blind for three days.** It matched an English verdict line
  only, in a project whose reviews are written in Arabic — so it silently discarded every
  passing review and demanded a fresh one for work already approved. Cost: four bypassed
  deploys in one night, and bypassing becoming a reflex, which is the exact behaviour a gate
  exists to prevent.

The second number is why this package has the design rule below, and why the rule is enforced
on shipguard's own code first.

---

## The rule

> **The first thing you test about a guard is not whether it catches the failure you had in
> mind. It is whether it can report success while blind.**

Not aspirational — it is in this repo's own tests:

- `test/verdict.test.mjs` starts with seven **rejections that contain their own approval word**
  (`ماينشرش` contains `ينشر`; `does not ship` contains `ship`). If the ordering in the parser
  is ever flipped, a review that concluded *do not ship* is read as clearance. Being too strict
  costs time; being too lax ships the bug the reviewer found and wrote down. Those are not
  symmetric.
- `test/review-gate.test.mjs` builds a **real throwaway git repo** rather than mocking, because
  two of the gate's three historical holes were in the interaction with git itself — a review
  file that counted while uncommitted, and a marker git could not resolve being discarded in
  silence. A mock would have reproduced neither.
- The glob matcher in `review-gate.mjs` was **wrong on day one** in a way that read perfectly
  fine: `src/money/**` compiled to a pattern that matched a directory and no file inside it,
  so every rule silently protected nothing. The test caught it in the first run. Reading it
  had not.

And one more, in the other direction: the first commit message here claimed a third bug —
"a crash exited 0" — that **did not exist**. It came from reading `$?` after a pipeline,
where it reports `tail`'s status rather than node's. The claim is corrected in the git log
rather than quietly deleted, because a package that tells you to prove things by running
them should not carry a false claim about itself.

---

## What it does

| | |
|---|---|
| **review gate** | Refuses to deploy when a file on your *risky* list changed without a committed review naming the commit it read and carrying a passing verdict. |
| **test runner** | Runs your suites and **names the ones that did not run**, in the summary, every time. |
| **pre-push hook** | Full production build before anything leaves your machine. |
| **secret scan** | Refuses to commit a key — scanning what is *staged*, and never echoing the secret. |

### Configure

`shipguard init` writes `shipguard.config.json`. The only decision that matters is `risky`:

```jsonc
"risky": [
  { "match": "**/checkout/**",  "why": "money" },
  { "match": "**/permissions.*", "why": "who can see what" },
  { "match": "migrations/**",    "why": "schema — a mistake here is not revertable by reverting" },
  { "match": "test/**",          "why": "gut one and the suite still reports a pass" }
]
```

The test for inclusion is **not** "is this important". It is: *would a mistake here read as a
plausible number instead of an error?* A broken button is obvious the moment anyone looks. A
total that is quietly 8,000 instead of 23,600 is not.

Keep the list short. A gate that always blocks is a gate people learn to bypass.

### Reviews

A review is a markdown file in `REVIEWS/` containing the commit it read and a verdict:

```markdown
<!-- reviewed-through: 46c037bc2734 -->

**Verdict: ships.**

1. `src/money/total.ts:88` — ...
```

Copy that sha with `git rev-parse --short=12 <commit>` — never retype it. It names the commit
the reviewer **read**, not the commit that fixed the findings.

The verdict may be written in any configured language. English and Arabic ship built in, and
**both are understood by default** — a reviewer writing in their own language must never
silently invalidate their own review.

### Use

```bash
npx shipguard check     # everything; the exit code decides
npx shipguard review    # what changed since the last passing review, and why it matters
```

Wire `check` into your deploy script. A check you have to remember to type will only be typed
by someone who is already suspicious, which is always too late.

### Bypassing

`SHIPGUARD_SKIP=1` bypasses. This is deliberate — a check you cannot bypass in an emergency
becomes a hostage situation. But it must be **typed, visible, and written into the commit
message**. `shipguard check` prints a warning naming the bypass and refuses to be quiet
about it.

---

## What this is not

- **Not a linter.** It runs yours.
- **Not a CI service.** It runs on your machine and in your CI, and decides on exit codes.
- **Not a substitute for someone reading the diff.** The gate enforces that a review
  *happened*; it cannot make the review good. On the project this came from, the reviews that
  found real bugs were the ones told exactly where to look and asked to prove their claims by
  running something.

## Licence

MIT.
