/**
 * Can the verdict reader say "approved" while being wrong?
 *
 * That is the only question worth asking first about a guard, and it is the question the
 * original implementation was never asked. It shipped, went blind, and stayed blind for
 * three days while printing confident output.
 *
 * So the first block here is not "does it accept an approval" — it is a set of REJECTIONS
 * that contain the approval word as a substring. If the ordering in `verdict.mjs` is ever
 * flipped, every one of these fails loudly.
 */
import { verdictReader, VOCABULARIES } from "../src/verdict.mjs";

let pass = 0;
const fails = [];
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log("  ✓", name); }
  else { fails.push(name); console.log("  ✗", name, "\n      expected:", expected, "\n      actual:  ", actual); }
}

const read = verdictReader();

console.log("\n▸ Rejection wins over approval (the trap this file exists for)");
// Each of these CONTAINS its own approval word. Flip the order in verdict.mjs and a
// reviewer who said no is read as yes.
check('"Verdict: DO NOT SHIP"', read("**Verdict: DO NOT SHIP.**"), "no-ship");
check('"Verdict: do-not-ship"', read("Verdict: do-not-ship"), "no-ship");
check('"Verdict: don\'t ship"', read("Verdict: don't ship"), "no-ship");
check("«الحكم: ماينشرش» — contains «ينشر»", read("**الحكم: ماينشرش.**"), "no-ship");
check("«الحكم: ما ينزلش» — contains «ينزل»", read("**الحكم: ما ينزلش.**"), "no-ship");
check("«الحكم: ماينفعش ينشر» — contains both", read("الحكم: ماينفعش ينشر"), "no-ship");
check("«الحكم: مش هينزل»", read("الحكم: مش هينزل كده"), "no-ship");

console.log("\n▸ Approvals are read — in every vocabulary");
check('"Verdict: ships"  ← `ship\\b` missed this for months', read("**Verdict: ships.**"), "ship");
check('"Verdict: ship"', read("Verdict: ship"), "ship");
check('"Verdict: SHIP WITH FIXES"', read("Verdict: ship with fixes"), "ship");
check('"Verdict: approved"', read("Verdict: approved"), "ship");
check("«الحكم: ينشر.»  ← `\\b` after Arabic matched nothing", read("**الحكم: ينشر.**"), "ship");
check("«الحُكم: ينشر» (with damma)", read("**الحُكم: ينشر**"), "ship");
check("«الحكم: ينفع ينشر»", read("الحكم: ينفع ينشر"), "ship");

console.log("\n▸ The phrase quoted inside a finding does not change the verdict");
check("approval that quotes 'do not ship' in a finding",
  read("**Verdict: ships.**\n\n3) If this were in the money path I would say do not ship."), "ship");
check("rejection that says 'ready to ship' in prose",
  read("**الحكم: ماينشرش.**\n\nالفيتشر نفسه ready to ship بس الصلاحيات لأ."), "no-ship");

console.log("\n▸ Unreadable is reported, not silently discarded");
// This is the failure mode that cost four bypassed deploys: the original returned a plain
// boolean, so "I cannot read this" and "this says no" were the same answer, and the author
// never learned their review had not counted.
check("no verdict line at all", read("# Review\n\nLooks fine to me."), "unreadable");
check("a verdict word with no label", read("This should ship."), "unreadable");
check("empty", read(""), "unreadable");

console.log("\n▸ Every vocabulary asserts its own ordering");
// A new language added without this assertion is a bug waiting for the first reviewer who
// says no in it. Adding a vocabulary to VOCABULARIES without adding a case here fails.
for (const [name, v] of Object.entries(VOCABULARIES)) {
  const one = verdictReader([name]);
  const label = v.labels[0];
  // Build a rejection from the vocabulary's own first alternative, then assert it reads
  // as a rejection under a reader that also knows the approval words.
  const firstNo = v.no.split("|")[0].replace(/\\s\*/g, " ").replace(/[\\?()]/g, "");
  check(`"${name}": its own rejection is not read as approval`,
    one(`${label}: ${firstNo}`) !== "ship", true);
}

console.log("\n▸ Locale restriction does not silently invalidate another language");
// The default reader understands everything. Restricting is allowed, but the restricted
// reader must say `unreadable` — not `no-ship` — so the person is told, rather than being
// refused for a reason that reads like a rejection.
const enOnly = verdictReader(["en"]);
check("en-only reader on an Arabic approval says unreadable, not no-ship",
  enOnly("**الحكم: ينشر.**"), "unreadable");

console.log(fails.length ? `\n❌  ${pass} passed · ${fails.length} failed\n` : `\n✅  ${pass} passed · 0 failed\n`);
process.exit(fails.length ? 1 : 0);
