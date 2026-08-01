/**
 * Can the migration helper accidentally supply a verdict?
 *
 * That is the ONE thing it must never do — writing `verdict:` would be a script guessing a human
 * judgment. So the first assertions migrate a real old review and prove the result carries
 * `reviewed-through:` but NO `verdict:`, and therefore still reads as `unreadable`: the human is
 * left to decide, which is the whole design.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readVerdict, readReviewedThrough } from "../src/verdict.mjs";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "migrate-reviews.mjs");

let pass = 0;
const fails = [];
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log("  ✓", name); }
  else { fails.push(name); console.log("  ✗", name, "\n      expected:", expected, "\n      actual:  ", actual); }
}

const root = mkdtempSync(join(tmpdir(), "sg-migrate-"));
const reviews = join(root, "REVIEWS");
mkdirSync(reviews);
const read = (f) => readFileSync(join(reviews, f), "utf8");
const migrate = () => execFileSync("node", [BIN, reviews], { encoding: "utf8" });

try {
  // An old-style review: the sha in an HTML comment, the verdict only in prose.
  writeFileSync(join(reviews, "r1.md"), "<!-- reviewed-through: 46c037bc2734 -->\n\nVerdict: ship. Looks fine.\n");
  // No sha at all — must be left for a human.
  writeFileSync(join(reviews, "r2.md"), "just some prose, no commit named.\n");
  // README must be ignored.
  writeFileSync(join(reviews, "README.md"), "# Reviews\n\ndocs, not a review.\n");
  migrate();

  console.log("\n▸ The mechanical move happens, the judgment does not");
  check("r1 gets frontmatter with the moved sha", readReviewedThrough(read("r1.md")), "46c037bc2734");
  check("r1 has NO verdict → still unreadable (human must decide)", readVerdict(read("r1.md")), "unreadable");
  check("r1's frontmatter contains no `verdict:` line",
    /verdict\s*:/i.test(read("r1.md").split(/^---$/m)[1] ?? ""), false);
  check("the prose verdict is preserved in the body, not read", /Verdict: ship\. Looks fine\./.test(read("r1.md")), true);

  console.log("\n▸ What it must not touch");
  check("r2 (no sha) is left exactly as it was", read("r2.md"), "just some prose, no commit named.\n");
  check("README.md is left exactly as it was", read("README.md"), "# Reviews\n\ndocs, not a review.\n");

  console.log("\n▸ Idempotent — safe to run twice");
  const after1 = read("r1.md");
  migrate();
  check("a second run does not change an already-migrated file", read("r1.md"), after1);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(fails.length ? `\n❌  ${pass} passed · ${fails.length} failed\n` : `\n✅  ${pass} passed · 0 failed\n`);
process.exit(fails.length ? 1 : 0);
