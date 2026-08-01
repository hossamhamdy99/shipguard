/**
 * Can the reader say "ship" while the review does not clearly declare it?
 *
 * The verdict lives in the review's FRONTMATTER — the `--- … ---` block that must be the very
 * first thing in the file. The body (prose, code fences, indented blocks, quotes) is never
 * read. So the first block here is the battery: a verdict that appears anywhere BUT the
 * frontmatter — as prose, inside a fence, indented, or after any other line — must resolve to
 * `unreadable`, never `ship`. That closes the whole class the prose parser and the inline
 * marker fell to: there is no code context to model, because the body is not read at all.
 */
import { readVerdict, readReviewedThrough } from "../src/verdict.mjs";

let pass = 0;
const fails = [];
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log("  ✓", name); }
  else { fails.push(name); console.log("  ✗", name, "\n      expected:", expected, "\n      actual:  ", actual); }
}

const fm = (v) => `---\nverdict: ${v}\n---\n`;

console.log("\n▸ Only the frontmatter is read — nothing in the body may declare a verdict");
check("no frontmatter, positive prose", readVerdict("Looks great. Ship it. LGTM. approved."), "unreadable");
check("empty", readVerdict(""), "unreadable");
check("an inline `<!-- verdict: ship -->` in the body is not read",
  readVerdict("<!-- verdict: ship -->"), "unreadable");
check("a fenced example of the frontmatter block is ignored",
  readVerdict("How to approve:\n```\n---\nverdict: ship\n---\n```\n"), "unreadable");
check("a --- block after other text is not frontmatter",
  readVerdict("intro\n\n---\nverdict: ship\n---\n"), "unreadable");
check("indented `verdict: ship` in the body is not frontmatter",
  readVerdict("notes:\n\n    verdict: ship\n"), "unreadable");
check("the reported bug shape (approve + reject prose, no frontmatter)",
  readVerdict("Verdict: ship initially.\nFinal verdict: do not ship — bills the customer wrong."), "unreadable");

console.log("\n▸ The frontmatter verdict decides — the body, in any language, is ignored");
check("frontmatter ship", readVerdict(fm("ship")), "ship");
check("frontmatter no-ship", readVerdict(fm("no-ship")), "no-ship");
check("no-ship is not read as ship (contains 'ship')", readVerdict(fm("no-ship")), "no-ship");
check("frontmatter ship + body says 'do not ship' → ship",
  readVerdict(`${fm("ship")}\nHonestly do not ship, it is broken.`), "ship");
check("frontmatter no-ship + body says 'ship it' → no-ship",
  readVerdict(`${fm("no-ship")}\nEverything looks fine, ship it.`), "no-ship");
check("realistic block with reviewed-through + non-English body",
  readVerdict("---\nreviewed-through: 46c037bc2734\nverdict: ship\n---\n\nrevisión: aprobada, todo bien.\n"), "ship");

console.log("\n▸ Conflicts and malformed values fail safe");
check("two frontmatter verdicts conflict → reject wins",
  readVerdict("---\nverdict: ship\nverdict: no-ship\n---\n"), "no-ship");
check("malformed `no  ship` (double space) → unreadable", readVerdict(fm("no  ship")), "unreadable");
check("malformed `ship!` → unreadable", readVerdict(fm("ship!")), "unreadable");
check("ship + a malformed second verdict → unreadable",
  readVerdict("---\nverdict: ship\nverdict: shipp\n---\n"), "unreadable");

console.log("\n▸ Keys and values are case-insensitive and whitespace-forgiving");
check("upper-case key and value", readVerdict("---\nVERDICT:   NO-SHIP  \n---\n"), "no-ship");
check("no space after colon", readVerdict("---\nverdict:ship\n---\n"), "ship");
check("underscore variant", readVerdict(fm("no_ship")), "no-ship");

console.log("\n▸ reviewed-through comes from the frontmatter, and must look like a sha");
check("reads the sha from frontmatter",
  readReviewedThrough("---\nreviewed-through: 46c037bc2734\nverdict: ship\n---\n"), "46c037bc2734");
check("absent → null", readReviewedThrough(fm("ship")), null);
check("a moving ref like `main` is not accepted",
  readReviewedThrough("---\nreviewed-through: main\nverdict: ship\n---\n"), null);
check("a sha only in the body (not frontmatter) is not read",
  readReviewedThrough("reviewed-through: 46c037bc2734\n"), null);

console.log(fails.length ? `\n❌  ${pass} passed · ${fails.length} failed\n` : `\n✅  ${pass} passed · 0 failed\n`);
process.exit(fails.length ? 1 : 0);
